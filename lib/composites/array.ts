import { Codec, type Stride } from "../codec.ts";
import { VarInt } from "../varint.ts";

// ── Array ─────────────────────────────────────────────────────────────────────

/**
 * Any codec can serve as the element codec for an {@link ArrayCodec}.
 * This is a type alias for {@link Codec} used for clarity in generic constraints.
 */
export type ArrayGeneric = Codec;

/**
 * Derives the encode-side (input) array element type from an element codec.
 *
 * @template T - The element codec type.
 */
export type ArrayInput<T extends ArrayGeneric> = Codec.InferInput<T>[];

/**
 * Derives the decode-side (output) array element type from an element codec.
 *
 * @template T - The element codec type.
 */
export type ArrayOutput<T extends ArrayGeneric> = Codec.InferOutput<T>[];

/**
 * Options controlling how {@link ArrayCodec} frames an array.
 *
 * Exactly one of the two shapes must be used:
 * - **Fixed** — supply `size` to encode/decode a constant number of elements
 *   with no count prefix.
 * - **Variable** — supply `counter` (a `Codec<number>`) to write a count prefix
 *   before the elements. Defaults to {@link VarInt} when neither option is given.
 *
 * @example Fixed 4-element array
 * ```ts
 * const Quad = new ArrayCodec(U8, { size: 4 });
 * ```
 *
 * @example Variable-length with a custom counter codec
 * ```ts
 * import { U16 } from "../primitives.ts";
 * const codec = new ArrayCodec(U32, { counter: U16 });
 * ```
 */
export type ArrayOptions =
	| {
		size: number;
		counter?: undefined;
	}
	| {
		counter: Codec<number>;
		size?: undefined;
	};

/**
 * Codec for a homogeneous array of elements.
 *
 * Supports two framing modes determined by the type parameter `O`:
 *
 * - **Fixed** (`O extends { size: number }`) — encodes/decodes exactly
 *   `options.size` elements. No count prefix is written; `stride` is
 *   `"fixed"` when the element codec also has a fixed stride (so the total
 *   byte size is `options.size * item.stride.size`), otherwise `"variable"`.
 * - **Variable** (default / `O` is `undefined` or `{ counter }`) — prefixes
 *   the elements with the element count encoded by `counter` (defaults to
 *   {@link VarInt}). `stride` is `"variable"`.
 *
 * @typeParam T - The element codec type (an {@link ArrayGeneric}).
 * @typeParam O - The {@link ArrayOptions} shape that selects fixed vs. variable
 *   framing, inferred from the constructor argument.
 *
 * @example Fixed-size array (no count prefix)
 * ```ts
 * const Quad = new ArrayCodec(U8, { size: 4 });
 * const encoded = Quad.encode([1, 2, 3, 4]);
 * const [decoded, consumed] = Quad.decode(encoded);
 * // decoded === [1, 2, 3, 4], consumed === 4
 * ```
 *
 * @example Variable-length array (VarInt count prefix)
 * ```ts
 * const U32Array = new ArrayCodec(U32);
 * const bytes = U32Array.encode([1, 2, 3]);
 * const [arr] = U32Array.decode(bytes);
 * // arr === [1, 2, 3]
 * ```
 *
 * @example Custom counter codec (e.g. fixed U16 count prefix)
 * ```ts
 * const codec = new ArrayCodec(Str, { counter: U16 });
 * ```
 */
export class ArrayCodec<T extends ArrayGeneric, const O extends ArrayOptions | undefined = undefined> extends Codec<ArrayOutput<T>, ArrayInput<T>> {
	/**
	 * Describes the memory layout of encoded values.
	 *
	 * - `Stride<"fixed">` when constructed with `{ size: N }` and the element
	 *   codec has a fixed stride (total byte size is `N * item.stride.size`).
	 * - `Stride<"variable">` otherwise.
	 */
	public readonly stride: O extends { size: number } ? (T extends { stride: Stride<"fixed"> } ? Stride<"fixed"> : Stride<"variable">)
		: Stride<"variable">;

	/** Codec used to encode/decode the element count prefix. Unused in fixed-size mode. */
	public readonly counter: Codec<number>;
	/** Codec used to encode/decode individual array elements. */
	public readonly item: T;

	private readonly elementCount: number | undefined;

	constructor(item: T, options?: O) {
		super();
		this.item = item;
		this.counter = options?.counter ?? VarInt;
		this.elementCount = options?.size;

		type S = ArrayCodec<T, O>["stride"];
		if (options?.size !== undefined) {
			if (item.stride.kind === "fixed") {
				this.stride = { kind: "fixed", size: options.size * item.stride.size } as S;
			} else {
				this.stride = { kind: "variable" } as S;
			}
		} else {
			this.stride = { kind: "variable" } as S;
		}
	}

	/**
	 * Encodes an array of values into its wire representation.
	 *
	 * - **Fixed mode** — encodes each element in sequence with no count prefix;
	 *   throws if `value.length !== options.size`.
	 * - **Variable mode** — prepends the element count encoded with
	 *   `this.counter`, then encodes each element.
	 *
	 * @param value - Array of values to encode.
	 * @param target - Omit (along with `offset`) to allocate and return a new
	 *   buffer. Pass a buffer to write in place.
	 * @param offset - Byte position within `target` to write at. Required together with `target`.
	 * @returns A new `Uint8Array` when `target` is omitted, otherwise the number of bytes written.
	 * @throws {RangeError} In fixed mode, if `value.length !== options.size`.
	 *
	 * @example
	 * const codec = new ArrayCodec(U8, { size: 3 });
	 * codec.encode([1, 2, 3]); // Uint8Array [1, 2, 3]
	 * codec.encode([1, 2]);    // throws RangeError
	 */
	public encoder(value: ArrayInput<T>, target: undefined, offset: undefined): Uint8Array<ArrayBuffer>;
	public encoder(value: ArrayInput<T>, target: Uint8Array, offset: number): number;
	public encoder(value: ArrayInput<T>, target?: Uint8Array, offset?: number): Uint8Array<ArrayBuffer> | number {
		if (this.elementCount !== undefined && value.length !== this.elementCount) {
			throw new RangeError(
				`Expected array of length ${this.elementCount}, got ${value.length}`,
			);
		}

		if (target !== undefined) {
			let size = 0;
			if (this.elementCount === undefined) {
				size += this.counter.encodeInto(value.length, target, offset!);
			}
			for (const item of value) {
				size += this.item.encodeInto(item, target, offset! + size);
			}
			return size;
		}

		if (this.elementCount !== undefined) {
			// If item has fixed stride, the total size is known — write directly.
			if (this.item.stride.kind === "fixed") {
				const result = new Uint8Array(this.elementCount * this.item.stride.size);
				let resultOffset = 0;
				for (const item of value) {
					resultOffset += this.item.encodeInto(item, result, resultOffset);
				}
				return result;
			}
			// Fixed count, variable item: encode parts then concat.
			const parts = value.map((item) => this.item.encode(item));
			const result = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
			let resultOffset = 0;
			for (const part of parts) {
				result.set(part, resultOffset);
				resultOffset += part.length;
			}
			return result;
		}
		// Variable count: encode parts, prepend count prefix.
		const parts = value.map((item) => this.item.encode(item));
		const combinedLength = parts.reduce((sum, p) => sum + p.length, 0);
		const prefix = this.counter.encode(value.length);
		const result = new Uint8Array(prefix.length + combinedLength);
		result.set(prefix);
		let resultOffset = prefix.length;
		for (const part of parts) {
			result.set(part, resultOffset);
			resultOffset += part.length;
		}
		return result;
	}

	/**
	 * Decodes a byte sequence into an array of values.
	 *
	 * - **Fixed mode** — decodes exactly `options.size` elements with no count
	 *   prefix.
	 * - **Variable mode** — reads the element count via `this.counter`, then
	 *   decodes that many elements sequentially.
	 *
	 * @param data - Byte array to decode from.
	 * @param offset - Byte position to begin reading from.
	 * @returns A tuple of `[decoded array, bytes consumed]`.
	 *
	 * @example
	 * const codec = new ArrayCodec(U8, { size: 3 });
	 * const [arr, n] = codec.decode(new Uint8Array([1, 2, 3, 99]));
	 * // arr === [1, 2, 3], n === 3
	 */
	public decoder(data: Uint8Array, offset: number): [ArrayOutput<T>, number] {
		if (this.elementCount !== undefined) {
			const result: ArrayOutput<T> = [];
			let currentOffset = offset;
			for (let i = 0; i < this.elementCount; i++) {
				const [value, size] = this.item.decode(data, currentOffset);
				result.push(value);
				currentOffset += size;
			}
			return [result, currentOffset - offset];
		}

		const [count, bytesRead] = this.counter.decode(data, offset);
		const result: ArrayOutput<T> = [];
		let currentOffset = offset + bytesRead;

		for (let i = 0; i < count; i++) {
			const [value, size] = this.item.decode(data, currentOffset);
			result.push(value);
			currentOffset += size;
		}

		return [result, currentOffset - offset];
	}
}
