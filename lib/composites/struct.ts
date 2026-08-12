import { Codec, type Stride } from "../codec.ts";
import { TupleCodec } from "./tuple.ts";
import { ModelCodec, type PartialShape } from "./model.ts";

// ── Struct ────────────────────────────────────────────────────────────────────

/**
 * A record mapping string keys to codecs. All fields are required; use
 * {@link ModelGeneric} / {@link ModelCodec} when optional fields are needed.
 */
export type StructGeneric = { readonly [key: string]: Codec };

/**
 * Derives the encode-side (input) object type from a {@link StructGeneric}
 * shape. All properties are optional at the type level to allow partial
 * encoding; missing values are encoded as their codec's zero/default.
 *
 * @template T - The struct shape.
 */
export type StructInput<T extends StructGeneric> = { -readonly [K in keyof T]: Codec.InferInput<T[K]> };

/**
 * Derives the decode-side (output) object type from a {@link StructGeneric}
 * shape. Every property is always present after decoding.
 *
 * @template T - The struct shape.
 */
export type StructOutput<T extends StructGeneric> = { -readonly [K in keyof T]: Codec.InferOutput<T[K]> };

/**
 * Codec for a fixed-key struct. Fields are encoded/decoded in insertion order
 * as a flat concatenation of their individual codec representations (delegated
 * to {@link TupleCodec} internally).
 *
 * Unlike {@link ModelCodec}, `StructCodec` does not support per-field
 * optionality — every field is always present in the byte stream. Use
 * `StructCodec.partial()` to obtain a {@link ModelCodec} where all fields
 * become optional.
 *
 * The `stride` is `"fixed"` when all field codecs have fixed strides;
 * `"variable"` otherwise.
 *
 * @template T - The struct shape (a {@link StructGeneric}).
 *
 * @example
 * const PointCodec = new StructCodec({ x: F32, y: F32 });
 *
 * const bytes = PointCodec.encode({ x: 1.0, y: 2.5 });
 * const [point] = PointCodec.decode(bytes);
 * // point.x === 1.0, point.y === 2.5
 */
export class StructCodec<const T extends StructGeneric> extends Codec<StructOutput<T>, StructInput<T>> {
	public readonly stride: Stride<"variable"> extends T[keyof T]["stride"] ? Stride<"variable"> : Stride<"fixed">;

	/** The original shape passed to the constructor. */
	public readonly shape: T;

	private readonly keys: Extract<keyof T, string>[];
	private readonly codecs: Codec[];
	private readonly tuple: TupleCodec<any>;
	private readonly args: string[];
	private readonly factory: (...args: unknown[]) => StructOutput<T>;
	// Generated encode-side writer: reads each field by literal key and writes
	// it straight into `target`, returning the byte count. Same `new Function`
	// codegen as `factory` — each `value["k"]` access and `codecs[i].encodeInto`
	// call site is monomorphic, so V8 keeps them fast and no intermediate
	// positional array is allocated on the hot `encodeInto` path.
	private readonly writeInto: (codecs: Codec[], value: StructInput<T>, target: Uint8Array, offset: number) => number;
	// Positional collector for the variable-stride allocate path, where total
	// size isn't known up front and we delegate to the tuple's concat. Avoids
	// the per-call `keys.map(closure)` allocation the old code paid every encode.
	private readonly collect: (value: StructInput<T>) => unknown[];

	constructor(shape: T) {
		super();
		this.shape = shape;
		this.keys = Object.keys(shape) as typeof this.keys;
		this.codecs = Object.values(shape);
		this.tuple = new TupleCodec(this.codecs);
		this.stride = this.tuple.stride as typeof this.stride;
		this.args = this.keys.keys().map((i) => `arg${i}`).toArray();

		const body = `return { ${this.keys.map((key, i) => `${JSON.stringify(String(key))}: arg${i}`).join(", ")} };`;
		this.factory = new Function(...this.args, body) as typeof this.factory;

		const writeBody = `let size = 0;\n${
			this.keys.map((key, i) => `size += codecs[${i}].encodeInto(value[${JSON.stringify(String(key))}], target, offset + size);`).join("\n")
		}\nreturn size;`;
		this.writeInto = new Function("codecs", "value", "target", "offset", writeBody) as typeof this.writeInto;

		const collectBody = `return [${this.keys.map((key) => `value[${JSON.stringify(String(key))}]`).join(", ")}];`;
		this.collect = new Function("value", collectBody) as typeof this.collect;
	}

	/**
	 * Encodes a struct value into bytes.
	 *
	 * Field values are extracted in declaration order and concatenated using the
	 * underlying {@link TupleCodec}.
	 *
	 * @param value - Object whose values are encoded in field-declaration order.
	 * @param target - Omit (along with `offset`) to allocate and return a new
	 *   buffer. Pass a buffer to write in place.
	 * @param offset - Byte position within `target` to write at. Required together with `target`.
	 * @returns A new `Uint8Array` when `target` is omitted, otherwise the number of bytes written.
	 *
	 * @example
	 * const bytes = PointCodec.encode({ x: 0, y: 1 });
	 */
	public encoder<TU extends Uint8Array = Uint8Array<ArrayBuffer>>(value: StructInput<T>, target?: TU, offset?: number): [TU, number] {
		// Hot path: write fields straight into the caller's buffer, zero extra allocation.
		if (target !== undefined) return [target, this.writeInto(this.codecs, value, target, offset!)];
		// Fixed stride: total size is known, so allocate the exact buffer and write into it directly.
		if (this.stride.kind === "fixed") {
			const out = new Uint8Array(this.stride.size);
			this.writeInto(this.codecs, value, out, 0);
			return [out as TU, this.stride.size];
		}
		// Variable stride: size isn't known up front; delegate to the tuple's concat with a
		// positionally-collected values array (no per-field closure allocation).
		const bytes = this.tuple.encode(this.collect(value));
		return [bytes as TU, bytes.length];
	}

	/**
	 * Decodes bytes into a struct output object.
	 *
	 * Values are decoded positionally by the underlying {@link TupleCodec} then
	 * mapped back to their named keys.
	 *
	 * @param data - Byte array to decode from.
	 * @param offset - Byte position to begin reading from.
	 * @returns A tuple of `[decoded struct object, bytes consumed]`.
	 *
	 * @example
	 * const [point, bytesRead] = PointCodec.decode(bytes);
	 */
	public decoder(data: Uint8Array, offset: number): [StructOutput<T>, number] {
		const [decoded, size] = this.tuple.decode(data, offset);
		return [this.factory(...decoded), size];
	}

	/**
	 * Returns a {@link ModelCodec} where every field of this struct becomes
	 * optional (presence-prefixed on the wire).
	 *
	 * Useful for building patch/update codecs from an existing struct definition.
	 *
	 * @returns A `ModelCodec` with shape {@link PartialShape}`<T>`.
	 *
	 * @example
	 * const PatchPoint = PointCodec.partial();
	 * const bytes = PatchPoint.encode({ x: 3.0 }); // y omitted
	 */
	public partial(): ModelCodec<PartialShape<T>> {
		const partialShapeArgs = new Array<Codec>(this.keys.length);
		const body = `return { ${this.keys.map((key, i) => `${JSON.stringify(`${String(key)}?`)}: arg${i}`).join(", ")} };`;
		const factory = new Function(...this.args, body);
		this.keys.forEach((key, i) => {
			partialShapeArgs[i] = this.shape[key]!;
		});
		return new ModelCodec(factory(...partialShapeArgs));
	}
}
