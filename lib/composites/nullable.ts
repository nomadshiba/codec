import { Codec, type Stride } from "../codec.ts";

// ── Nullable ──────────────────────────────────────────────────────────────────

/**
 * Any codec can serve as the inner codec for a {@link NullableCodec}.
 * This is a type alias for {@link Codec} used for clarity in generic constraints.
 */
export type NullableGeneric = Codec;

/**
 * Derives the encode-side (input) type for a nullable value — either the inner
 * codec's input type or `null`.
 *
 * @template T - The inner codec type.
 */
export type NullableInput<T extends NullableGeneric> =
	| Codec.InferInput<T>
	| null;

/**
 * Derives the decode-side (output) type for a nullable value — either the inner
 * codec's output type or `null`.
 *
 * @template T - The inner codec type.
 */
export type NullableOutput<T extends NullableGeneric> =
	| Codec.InferOutput<T>
	| null;

/**
 * Codec that wraps another codec to make its value optional (`null` or a
 * concrete value).
 *
 * **Wire format (variable-stride inner):**
 * - `null`  → `[0x00]` (1 byte)
 * - present → `[0x01][encodedValue...]`
 *
 * **Wire format (fixed-stride inner):**
 * - `null`  → `stride.size` zero bytes (presence byte + zeroed payload)
 * - present → `[0x01][encodedValue]` (always exactly `stride.size` bytes)
 *
 * The `stride` is `"fixed"` when the inner codec has a fixed stride (total
 * size = `1 + inner.stride.size`); `"variable"` otherwise.
 *
 * @template T - The inner codec type (a {@link NullableGeneric}).
 *
 * @example
 * const MaybeU32 = new NullableCodec(U32);
 *
 * const presentBytes = MaybeU32.encode(42);   // [0x01, ...u32 bytes]
 * const nullBytes    = MaybeU32.encode(null);  // [0x00, 0x00, 0x00, 0x00, 0x00]
 *
 * const [val]  = MaybeU32.decode(presentBytes); // val === 42
 * const [none] = MaybeU32.decode(nullBytes);    // none === null
 *
 * @example
 * // Variable-stride inner (e.g. string)
 * const MaybeStr = new NullableCodec(Utf8);
 * const bytes = MaybeStr.encode("hello"); // [0x01, ...utf8 bytes]
 */
export class NullableCodec<T extends NullableGeneric> extends Codec<NullableOutput<T>, NullableInput<T>> {
	/** The wrapped inner codec. */
	public readonly inner: T;

	public readonly stride: T["stride"] extends Stride<"fixed"> ? Stride<"fixed">
		: Stride<"variable">;

	constructor(inner: T) {
		super();
		this.inner = inner;
		this.stride = (
			inner.stride.kind === "fixed" ? { kind: "fixed", size: 1 + inner.stride.size } : { kind: "variable" }
		) as typeof this.stride;
	}

	/**
	 * Encodes a nullable value into bytes.
	 *
	 * - If `value` is `null`: writes a zeroed block (`0x00` presence byte, plus
	 *   zero-padding to fill fixed stride if applicable).
	 * - Otherwise: writes `0x01` followed by the inner codec's encoding.
	 *
	 * @param value - The value to encode, or `null`.
	 * @param target - Omit (along with `offset`) to allocate and return a new
	 *   buffer. Pass a buffer to write in place.
	 * @param offset - Byte position within `target` to write at. Required together with `target`.
	 * @returns A new `Uint8Array` when `target` is omitted, otherwise the number of bytes written.
	 *
	 * @example
	 * const bytes = codec.encode(null);   // presence byte = 0x00
	 * const bytes = codec.encode("hi");   // presence byte = 0x01, then payload
	 */
	public encoder(value: NullableInput<T>, target: undefined, offset: undefined): Uint8Array<ArrayBuffer>;
	public encoder(value: NullableInput<T>, target: Uint8Array, offset: number): number;
	public encoder(value: NullableInput<T>, target?: Uint8Array, offset?: number): Uint8Array<ArrayBuffer> | number {
		if (target === undefined) {
			if (value === null) {
				const size = this.stride.kind === "fixed" ? this.stride.size : 1;
				return new Uint8Array(size); // zero-filled by default
			}
			const encoded = this.inner.encode(value);
			const result = new Uint8Array(1 + encoded.length);
			result[0] = 1;
			result.set(encoded, 1);
			return result;
		}
		if (value === null) {
			const size = this.stride.kind === "fixed" ? this.stride.size : 1;
			target.fill(0, offset, offset! + size);
			return size;
		}
		target[offset!] = 1;
		return 1 + this.inner.encodeInto(value, target, offset! + 1);
	}

	/**
	 * Decodes bytes into a nullable output value.
	 *
	 * Reads the byte at `offset` as a presence flag:
	 * - `0x00`: returns `null`. Consumes `stride.size` bytes for fixed inner
	 *   codecs, or `1` byte for variable inner codecs.
	 * - Any other value: decodes the inner value starting at `offset + 1`.
	 *
	 * @param data - Byte array to decode from.
	 * @param offset - Byte position to begin reading from.
	 * @returns A tuple of `[value | null, bytes consumed]`.
	 *
	 * @example
	 * const [val, n] = codec.decode(bytes);
	 * if (val === null) { ... }
	 */
	public decoder(data: Uint8Array, offset: number): [NullableOutput<T>, number] {
		if (data[offset] === 0) {
			const size = this.stride.kind === "fixed" ? this.stride.size : 1;
			return [null, size];
		} else {
			const [value, size] = this.inner.decode(data, offset + 1);
			return [value, 1 + size];
		}
	}
}
