import { assertEquals, assertThrows } from "@std/assert";
import { FixedEnumCodec } from "~/composites/padded_enum.ts";
import { U16, U32, U8, Void } from "~/primitives.ts";
import { VarInt } from "~/varint.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

// Simple 2-variant codec: A=U8 (1 byte), B=U32 (4 bytes)
// stride = 1 (U8 indexer) + 4 (max) = 5 bytes
const AB = new FixedEnumCodec({ A: U8, B: U32 });

// ── 1. Basic roundtrip — no payload ──────────────────────────────────────────

Deno.test("FixedEnum - roundtrip: empty variant (Void)", () => {
	const codec = new FixedEnumCodec({ Empty: Void, Full: U32 });
	const val = { kind: "Empty", value: undefined } as const;
	const [decoded] = codec.decode(codec.encode(val));
	assertEquals(decoded, { kind: "Empty", value: undefined });
});

Deno.test("FixedEnum - roundtrip: payload variant (Void alongside U32)", () => {
	const codec = new FixedEnumCodec({ Empty: Void, Full: U32 });
	const val = { kind: "Full", value: 0xdeadbeef } as const;
	const [decoded] = codec.decode(codec.encode(val));
	assertEquals(decoded, val);
});

// ── 2. Basic roundtrip — simple fixed-size payloads ──────────────────────────

Deno.test("FixedEnum - roundtrip: U8 variant", () => {
	const val = { kind: "A", value: 42 } as const;
	const [decoded] = AB.decode(AB.encode(val));
	assertEquals(decoded, val);
});

Deno.test("FixedEnum - roundtrip: U32 variant", () => {
	const val = { kind: "B", value: 0xcafebabe } as const;
	const [decoded] = AB.decode(AB.encode(val));
	assertEquals(decoded, val);
});

// ── 3. Stride is always fixed ─────────────────────────────────────────────────

Deno.test("FixedEnum - stride is fixed, size = indexer + maxVariant", () => {
	assertEquals(AB.stride, { kind: "fixed", size: 5 }); // 1 + 4
});

Deno.test("FixedEnum - stride with U16 indexer", () => {
	const codec = new FixedEnumCodec({ A: U8, B: U32 }, { indexer: U16 });
	assertEquals(codec.stride, { kind: "fixed", size: 6 }); // 2 + 4
});

Deno.test("FixedEnum - stride with all Void variants is indexer size", () => {
	const codec = new FixedEnumCodec({ X: Void, Y: Void });
	assertEquals(codec.stride, { kind: "fixed", size: 1 }); // 1 + 0
});

// ── 4. Padding: all encoded values same length ────────────────────────────────

Deno.test("FixedEnum - all variants encode to same byte length", () => {
	const encA = AB.encode({ kind: "A", value: 7 });
	const encB = AB.encode({ kind: "B", value: 7 });
	assertEquals(encA.length, AB.stride.size);
	assertEquals(encB.length, AB.stride.size);
	assertEquals(encA.length, encB.length);
});

Deno.test("FixedEnum - smaller variant payload is zero-padded", () => {
	// A is U8 (1 byte), B is U32 (4 bytes). maxVariantSize = 4.
	// Encoding A=0x55: [indexA=0x00][0x55][0x00][0x00][0x00]
	const enc = AB.encode({ kind: "A", value: 0x55 });
	assertEquals(enc[0], 0x00); // index for A
	assertEquals(enc[1], 0x55); // payload
	assertEquals(enc[2], 0x00); // padding
	assertEquals(enc[3], 0x00);
	assertEquals(enc[4], 0x00);
});

// ── 5. Custom indexer codec ───────────────────────────────────────────────────

Deno.test("FixedEnum - custom U16 indexer: wire format correct", () => {
	const codec = new FixedEnumCodec({ A: U8, B: U32 }, { indexer: U16 });
	const enc = codec.encode({ kind: "B", value: 1 });
	// B is index 1, big-endian U16 = [0x00, 0x01]
	assertEquals(enc[0], 0x00);
	assertEquals(enc[1], 0x01);
	// payload = U32(1) = [0x00, 0x00, 0x00, 0x01]
	assertEquals(enc[2], 0x00);
	assertEquals(enc[3], 0x00);
	assertEquals(enc[4], 0x00);
	assertEquals(enc[5], 0x01);
	assertEquals(enc.length, 6);
});

Deno.test("FixedEnum - custom U16 indexer: roundtrip", () => {
	const codec = new FixedEnumCodec({ A: U8, B: U32 }, { indexer: U16 });
	const val = { kind: "A", value: 200 } as const;
	const [decoded] = codec.decode(codec.encode(val));
	assertEquals(decoded, val);
});

// ── 6. Constructor error: variable-stride variant ─────────────────────────────

Deno.test("FixedEnum - constructor throws for variable-stride variant", () => {
	assertThrows(
		() => new FixedEnumCodec({ A: U8, B: VarInt as never }),
		Error,
		`FixedEnumCodec: variant "B" must have a fixed-size codec`,
	);
});

// ── 7. Constructor error: variable-stride indexer ─────────────────────────────

Deno.test("FixedEnum - constructor throws for variable-stride indexer", () => {
	assertThrows(
		() => new FixedEnumCodec({ A: U8 }, { indexer: VarInt as never }),
		Error,
		"FixedEnumCodec: indexer must have a fixed-size codec",
	);
});

// ── 8. Encode error: invalid variant name ─────────────────────────────────────

Deno.test("FixedEnum - encode throws for invalid variant name", () => {
	assertThrows(
		() => AB.encode({ kind: "Z" as never, value: 0 }),
		Error,
		"Invalid union variant: Z",
	);
});

// ── 9. Decode error: out-of-range index ──────────────────────────────────────

Deno.test("FixedEnum - decode throws for out-of-range index", () => {
	// AB has 2 variants (indices 0, 1). Craft bytes with index=99.
	const bad = new Uint8Array(AB.stride.size);
	bad[0] = 99;
	assertThrows(
		() => AB.decode(bad),
		Error,
		"Invalid union index: 99",
	);
});

// ── 10. Wire format: variant definition order determines index ────────────────

Deno.test("FixedEnum - variant index follows definition order", () => {
	const codec = new FixedEnumCodec({ Z: U8, A: U8, M: U8 });
	assertEquals(codec.encode({ kind: "Z", value: 0 })[0], 0);
	assertEquals(codec.encode({ kind: "A", value: 0 })[0], 1);
	assertEquals(codec.encode({ kind: "M", value: 0 })[0], 2);
});

Deno.test("FixedEnum - decode returns stride.size as bytesRead", () => {
	const [, bytesRead] = AB.decode(AB.encode({ kind: "A", value: 1 }));
	assertEquals(bytesRead, AB.stride.size);
});

Deno.test("FixedEnum - maxVariantSize exposed correctly", () => {
	assertEquals(AB.maxVariantSize, 4); // max(U8=1, U32=4)
});

Deno.test("FixedEnum - encodeInto", () => {
	const target = new Uint8Array(16);
	const written = AB.encodeInto({ kind: "A", value: 0x55 }, target, 1);
	assertEquals(written, AB.stride.size);
	const [decoded, bytesRead] = AB.decode(target.subarray(1, 1 + written));
	assertEquals(decoded, { kind: "A", value: 0x55 });
	assertEquals(bytesRead, written);
});

Deno.test("FixedEnum - encodeInto zero-pads", () => {
	const target = new Uint8Array(16);
	target.fill(0xFF);
	AB.encodeInto({ kind: "A", value: 0x55 }, target, 1);
	assertEquals(target[1], 0x00); // index A
	assertEquals(target[2], 0x55); // payload
	assertEquals(Array.from(target.subarray(3, 6)), [0x00, 0x00, 0x00]); // padding
});

Deno.test("FixedEnum - encodeInto matches encode", () => {
	const val = { kind: "B", value: 0xcafebabe } as const;
	const encoded = AB.encode(val);
	const target = new Uint8Array(encoded.length + 4);
	const written = AB.encodeInto(val, target, 4);
	assertEquals(written, encoded.length);
	assertEquals(Array.from(target.subarray(4, 4 + written)), Array.from(encoded));
});
