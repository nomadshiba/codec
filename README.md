# @nomadshiba/codec

**Composable, type-safe binary codecs for TypeScript & JavaScript.**

Define your wire format once as a value. Get a fully-typed `encode`/`decode` pair to and from `Uint8Array` — no schema files, no code generation, no decorators.
Small codecs snap together into big ones, and TypeScript infers the exact shape of everything you build.

```ts
import { ArrayCodec, Str, StructCodec, U32, U8 } from "@nomadshiba/codec";

const User = new StructCodec({
	id: U32,
	name: Str,
	roles: new ArrayCodec(U8),
});

const bytes = User.encode({ id: 1, name: "Ada", roles: [0, 3] });
const [user] = User.decode(bytes);
// user: { id: number; name: string; roles: number[] }
```

---

## Why

- **Composable by construction.** Every codec is a first-class value. Nest structs in arrays in enums in nullables — it's just function calls, and the types
  follow.
- **Type-safe, no boilerplate.** Your codec _is_ your type. `Codec.InferInput` / `Codec.InferOutput` derive the TS types straight from the definition, so they
  can never drift out of sync.
- **You own the bytes.** Big-endian by default, little-endian variants, `VarInt`, fixed-size framing, padded enums — the encoded layout is exactly what you
  specify. Great for protocols, file formats, and on-chain/compact payloads.
- **Fast paths built in.** Zero-copy decoding for bytes and strings (returns subarray views), and `encodeInto` writes directly into a buffer you already
  allocated — no throwaway allocations in hot loops.
- **Runs anywhere.** Deno, Node, Bun, browsers. Published on JSR, no runtime dependencies beyond the standard library.

---

## Install

```bash
deno add jsr:@nomadshiba/codec
```

<details>
<summary>Other package managers</summary>

```bash
npx jsr add @nomadshiba/codec       # npm
pnpm i jsr:@nomadshiba/codec        # pnpm >=10.8
pnpm dlx jsr add @nomadshiba/codec  # pnpm <10.8
yarn add jsr:@nomadshiba/codec      # yarn >=4.8
yarn dlx jsr add @nomadshiba/codec  # yarn <4.8
bunx jsr add @nomadshiba/codec      # bun
vlt install jsr:@nomadshiba/codec   # vlt
```

</details>

---

## The codec model

Every codec extends `Codec<O, I>` — `O` is the type you get from `decode`, `I` the type you pass to `encode` (defaults to `O`). `O` must extend `I`: `encode`
can be lenient and accept several input forms, while `decode` returns one canonical type that's always assignable back to what `encode` takes. Four members
matter:

| Member       | Signature                                                   | What it does                                            |
| ------------ | ----------------------------------------------------------- | ------------------------------------------------------- |
| `encode`     | `(value: I) => Uint8Array`                                  | Encode into a freshly allocated buffer.                 |
| `encodeInto` | `(value: I, target: Uint8Array, offset?: number) => number` | Encode in place into `target`; returns bytes written.   |
| `decode`     | `(data: Uint8Array, offset?: number) => [O, number]`        | Decode from `offset`; returns `[value, bytesConsumed]`. |
| `stride`     | `{ kind: "fixed"; size } \| { kind: "variable" }`           | Whether encoded size is constant or value-dependent.    |

`decode` returning the byte count means you can read many values back-to-back from one buffer by advancing the offset yourself. `stride` is what lets composites
know their own size at build time — it's how `FixedEnumCodec` and fixed-size framing work.

### Types come for free

```ts
import { Codec, Str, StructCodec, U32 } from "@nomadshiba/codec";

const User = new StructCodec({ id: U32, name: Str });

type User = Codec.InferOutput<typeof User>; // { id: number; name: string }
type UserIn = Codec.InferInput<typeof User>; // { id: number; name: string }
```

---

## Primitives

Fixed-width numbers and booleans, plus a zero-byte `Void`. Each has a ready-made **singleton** (`U32`) and an underlying **class** (`U32Codec`) for when you
need options.

| Codecs                            | Decoded type      |
| --------------------------------- | ----------------- |
| `U8` `I8` `U16` `I16` `U32` `I32` | `number`          |
| `U64` `I64`                       | `bigint`          |
| `F32` `F64`                       | `number`          |
| `Bool`                            | `boolean`         |
| `Void`                            | `undefined` (0 B) |
| `VarInt`                          | `number` (LEB128) |
| `BigVarInt`                       | `bigint` (LEB128) |

**Big-endian is the default.** Every 16-bit-and-wider codec ships a `*LE` little-endian singleton, or pass `{ endian: "le" }` to the class:

```ts
import { U16LE, U32Codec } from "@nomadshiba/codec";

U16LE.encode(0xABCD); // little-endian singleton
const u32le = new U32Codec({ endian: "le" }); // or construct your own
```

`VarInt` uses LEB128, so small numbers cost fewer bytes (0–127 → 1 byte, up to 16383 → 2 bytes, …). `BigVarInt` is the same encoding with no upper bound, backed
by `bigint`.

---

## Variable-length data

### Strings — `Str`

UTF-8 with a length prefix. `Str` is the ready-made singleton (a `new StringCodec()`); reach for the class only to change the framing.

```ts
import { Str, StringCodec, U32 } from "@nomadshiba/codec";

Str.encode("hello"); // [0x05, "hello"]  — VarInt length prefix

new StringCodec({ sizer: U32 }); // fixed 4-byte length prefix instead of VarInt
new StringCodec({ size: 36 }); // exactly 36 UTF-8 bytes, no prefix (throws on mismatch)
```

### Bytes — `Bytes`

Raw `Uint8Array`, same framing options. Decoding is **zero-copy** — you get a subarray view into the source buffer.

```ts
import { Bytes, BytesCodec } from "@nomadshiba/codec";

Bytes.encode(new Uint8Array([1, 2, 3])); // VarInt-prefixed
new BytesCodec({ size: 32 }); // fixed 32-byte field, e.g. a key or hash
```

---

## Composites

### Struct — fixed set of named fields

Fields are encoded in **definition order** as a flat concatenation. All fields required. `stride` is `"fixed"` when every field is fixed-size.

```ts
import { F32, StructCodec } from "@nomadshiba/codec";

const Point = new StructCodec({ x: F32, y: F32 });
Point.encode({ x: 1, y: 2.5 }); // 8 bytes, no framing overhead
```

> Reordering fields changes the binary layout and breaks compatibility with previously encoded data.

### Model — named fields _with optional ones_

Same as `Struct`, but append `?` to any key to make that field optional. Optional fields get a one-byte presence flag on the wire (`0x00` absent, `0x01`
present) and become `?:` in the inferred type — required fields stay required.

```ts
import { Codec, ModelCodec, Str, U32, U8 } from "@nomadshiba/codec";

const User = new ModelCodec({
	id: U32,
	name: Str,
	"age?": U8, // optional
	"bio?": Str, // optional
});

User.encode({ id: 1, name: "Ada" }); // age + bio omitted from bytes
User.encode({ id: 1, name: "Ada", age: 30, bio: "hi" }); // all present

type User = Codec.InferOutput<typeof User>;
// { id: number; name: string; age?: number; bio?: string }
```

Use `Struct` when every field is always present; reach for `Model` the moment you need optionality. Both expose `.shape`, and both have `.partial()` — returning
a `ModelCodec` where every field is optional (handy for PATCH-style updates):

```ts
const Patch = User.partial();
Patch.encode({ name: "Ada" }); // encode just the fields you have
```

### Array — many of the same thing

Count prefix (VarInt by default) followed by the elements.

```ts
import { ArrayCodec, U16, U32 } from "@nomadshiba/codec";

new ArrayCodec(U16).encode([1, 2, 3]); // [count, ...elements]
new ArrayCodec(U16, { counter: U32 }); // fixed 4-byte count instead of VarInt
```

### Tuple — fixed-length, mixed types

Elements concatenated with no wrapper of its own.

```ts
import { Str, TupleCodec, U8 } from "@nomadshiba/codec";

new TupleCodec([U8, Str]).encode([7, "hi"]); // [0x07, 0x02, "hi"]
```

### Nullable — a value or `null`

Presence byte, then the value. Fixed-size inners stay fixed-size (`null` is zero-padded), so it's safe inside padded layouts.

```ts
import { NullableCodec, U8 } from "@nomadshiba/codec";

const MaybeU8 = new NullableCodec(U8);
MaybeU8.encode(null); // [0x00, 0x00]
MaybeU8.encode(7); // [0x01, 0x07]
```

#### Nullable vs. an optional Model field

Both use a presence byte, but they exist for opposite goals — **fixed layout vs. dynamic packing.**

A **Model optional field** (`"key?"`) wants to be dynamic: it packs only what's actually there. Absent → a single `0x00` and nothing else (the inner codec never
runs, no space reserved); present → `0x01` then the value. The encoded size depends on which fields you supply, which is exactly why any optional field makes
the struct `variable`. Compact, at the cost of a predictable layout.

**Nullable with a fixed inner** refuses to be dynamic: it keeps the slot reserved either way. `null` still writes the presence byte plus a **zero-padded**
payload, so the field is always `1 + inner.size` bytes whether or not there's a value. That constant footprint is what lets the stride stay `fixed` — every
record lands at the same offset, so you can index or memory-map arrays of them.

```ts
new ModelCodec({ "age?": U8 }); // absent = 1 byte; the U8 is dropped     → variable
new NullableCodec(U8); //           null  = 2 bytes; the U8 slot is zeroed → fixed
```

So: reach for an **optional field** to avoid spending bytes on data that isn't there; reach for **Nullable** when you want the shape to never move. The fixed
behaviour only applies to a fixed inner — give Nullable a variable inner (a string, an array) and there's nothing to pad to, so it falls back to the dynamic
form (`0x00` for null, `0x01 + value` otherwise) and goes `variable` like Model.

### Enum — tagged unions

A discriminant index (default `U8`, up to 256 variants) plus the selected variant's payload. Decodes to `{ kind, value }`.

```ts
import { EnumCodec, Str, U8 } from "@nomadshiba/codec";

const Event = new EnumCodec({
	Click: U8, // index 0
	Message: Str, // index 1
});

Event.encode({ kind: "Click", value: 5 });
Event.encode({ kind: "Message", value: "hello" });
```

> Variant order fixes the indices. Adding/removing variants shifts them and breaks old data; renaming is safe.

### FixedEnum — fixed-size tagged unions

Like `Enum`, but every variant must be fixed-size and all encode to the **same** constant length (shorter payloads are zero-padded), so the whole codec stays
`fixed`. Useful when you need uniform records — arrays of enums, memory-mappable formats, fixed-size packets.

```ts
import { FixedEnumCodec, U16, U8 } from "@nomadshiba/codec";

const E = new FixedEnumCodec({ Click: U8, Scroll: U16 });
// stride: fixed 3 bytes (1 index + 2 max payload)
E.encode({ kind: "Click", value: 5 }); // [0x00, 0x05, 0x00]  ← padded
E.encode({ kind: "Scroll", value: 300 }); // [0x01, 0x01, 0x2C]
```

The fixed-size requirement is guarded both ways: variants are constrained to fixed-size codecs at the type level, _and_ the constructor throws if a
variable-stride variant (or a variable-stride custom `indexer`) slips through. For variable-length variants, use `Enum` instead.

> Renamed from `PaddedEnumCodec` in 0.6.0. The old `PaddedEnum*` names still work as deprecated aliases.

### Mapping — `Map<K, V>`

A count-prefixed list of `[key, value]` pairs.

```ts
import { MappingCodec, Str, U8 } from "@nomadshiba/codec";

const Dict = new MappingCodec([Str, U8]);
Dict.encode(new Map([["x", 1], ["y", 2]]));
```

---

## Transform — decode into richer values

`.transform()` wraps any codec with a post-decode step. Encoding is unchanged; decoding runs your function on the result. The transformed type must extend the
codec's output type, so you can narrow, brand, validate, attach methods, or capture the raw bytes — but never wander off into an unrelated type.

```ts
import { F32, StructCodec, U64 } from "@nomadshiba/codec";

// u64 milliseconds → Date
const Timestamp = U64.transform((ms) => new Date(Number(ms)));
Timestamp.encode(BigInt(Date.now())); // still a plain u64 on the wire
const [when] = Timestamp.decode(bytes); // Date

// validate on the way in
const SmallU32 = U32.transform((n) => {
	if (n > 1000) throw new Error("out of range");
	return n;
});

// attach behaviour + keep the raw bytes
const Point = new StructCodec({ x: F32, y: F32 });
const RichPoint = Point.transform((p, bytes) => ({
	...p,
	raw: bytes,
	dist() {
		return Math.hypot(this.x, this.y);
	},
}));
```

The result is a `TransformCodec`; its `.inner` holds the codec you wrapped.

---

## Custom codecs

When the building blocks aren't enough, extend `Codec<O, I>` and implement `stride`, `encoder`, and `decoder`. The base class turns those into `encode`,
`encodeInto`, and `decode` for you. Declare `implements FixedCodec<O, I>` for fixed-size codecs so TypeScript checks your `stride`.

```ts
import { Codec, type FixedCodec, type Stride, U64 } from "@nomadshiba/codec";

class DateCodec extends Codec<Date, Date | bigint> implements FixedCodec<Date, Date | bigint> {
	readonly stride: Stride<"fixed"> = { kind: "fixed", size: 8 };

	encoder(value: Date | bigint, target: undefined, offset: undefined): Uint8Array<ArrayBuffer>;
	encoder(value: Date | bigint, target: Uint8Array, offset: number): number;
	encoder(value: Date | bigint, target?: Uint8Array, offset?: number): Uint8Array<ArrayBuffer> | number {
		const ms = typeof value === "bigint" ? value : BigInt(value.getTime());
		return target === undefined ? U64.encode(ms) : U64.encodeInto(ms, target, offset);
	}

	decoder(data: Uint8Array, offset: number): [Date, number] {
		const [ms, size] = U64.decode(data, offset);
		return [new Date(Number(ms)), size];
	}
}
```

`encoder` is overloaded on purpose: called with no `target` it allocates and returns a `Uint8Array`; called with a `target`/`offset` it writes in place and
returns the byte count — the same dual mode that powers `encodeInto` throughout the library.

The two type parameters are `O` (decoded output) and `I` (encoded input, defaults to `O`), and **`O` must extend `I`**. That lets `encode` accept a wider type
than `decode` returns — the `DateCodec` above takes `Date | bigint` on the way in but always hands back a `Date`.

---

## Generic helpers

For most code, `Codec.InferInput` / `Codec.InferOutput` are all you need. When you write functions _over_ codecs, each composite also exports a `*Generic`
constraint plus `*Input<T>` / `*Output<T>` pairs:

```ts
import { ArrayCodec, type ArrayGeneric, type ArrayOutput } from "@nomadshiba/codec";

function decodeAll<T extends ArrayGeneric>(codec: ArrayCodec<T>, data: Uint8Array): ArrayOutput<T> {
	return codec.decode(data)[0];
}
```

The full set: `Nullable`, `Tuple`, `Struct`, `Model`, `Array`, `Enum`, `FixedEnum`, `Mapping` — each with `*Generic` / `*Input` / `*Output`.

---

## Breaking changes

See the [migrations](./migrations/) folder for per-version upgrade notes.

## License

[LGPL v2.1](LICENSE)
