import { Codec, type Stride } from "../codec.ts";
import { VarInt } from "../varint.ts";

/**
 * Options controlling how {@link BytesCodec} frames a byte array.
 *
 * Exactly one of the two shapes must be used:
 * - **Fixed** — supply `size` to encode/decode a constant number of bytes with
 *   no length prefix.
 * - **Variable** — supply `sizer` (a `Codec<number>`) to write a length prefix
 *   before the payload. Defaults to {@link VarInt} when neither option is given.
 *
 * @example Fixed 32-byte key
 * ```ts
 * const Key32 = new BytesCodec({ size: 32 });
 * ```
 *
 * @example Variable-length with a custom sizer
 * ```ts
 * import { UInt32BE } from "../int.ts";
 * const BlobCodec = new BytesCodec({ sizer: UInt32BE });
 * ```
 */
export type BytesOptions =
	| {
		size: number;
		sizer?: undefined;
	}
	| {
		sizer: Codec<number>;
		size?: undefined;
	};

/**
 * Codec for raw `Uint8Array` values.
 *
 * Supports two framing modes determined by the type parameter `O`:
 *
 * - **Fixed** (`O extends { size: number }`) — encodes/decodes exactly
 *   `options.size` bytes. No length prefix is written; `stride` is
 *   `"fixed"`.
 * - **Variable** (default / `O` is `undefined` or `{ sizer }`) — prefixes the
 *   payload with its byte-length encoded by `sizer` (defaults to
 *   {@link VarInt}). `stride` is `"variable"`.
 *
 * @typeParam O - The {@link BytesOptions} shape that selects fixed vs. variable
 *   framing, inferred from the constructor argument.
 *
 * @example Fixed-size codec (no length prefix)
 * ```ts
 * const Ed25519Key = new BytesCodec({ size: 32 });
 * const encoded = Ed25519Key.encode(new Uint8Array(32));
 * const [decoded, consumed] = Ed25519Key.decode(encoded);
 * // decoded.length === 32, consumed === 32
 * ```
 *
 * @example Variable-length codec (VarInt length prefix)
 * ```ts
 * const payload = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
 * const encoded = Bytes.encode(payload);
 * const [decoded, consumed] = Bytes.decode(encoded);
 * ```
 */
export class BytesCodec<const O extends BytesOptions | undefined = undefined> extends Codec<Uint8Array> {
	/**
	 * Describes the memory layout of encoded values.
	 *
	 * - `Stride<"fixed">` when constructed with `{ size: N }`.
	 * - `Stride<"variable">` otherwise.
	 */
	public readonly stride: O extends { size: number } ? Stride<"fixed">
		: Stride<"variable">;

	/**
	 * The codec used to encode/decode the length prefix in variable mode.
	 * Defaults to {@link VarInt}. Unused in fixed-size mode.
	 */
	public readonly sizer: Codec<number>;

	constructor(options?: O) {
		super();
		this.stride = (options?.size !== undefined ? { kind: "fixed", size: options.size } : { kind: "variable" }) as typeof this.stride;
		this.sizer = options?.sizer ?? VarInt;
	}

	/**
	 * Encodes a `Uint8Array` into its wire representation.
	 *
	 * - **Fixed mode** — copies `value` verbatim; throws if
	 *   `value.length !== options.size`.
	 * - **Variable mode** — prepends the byte-length of `value` using
	 *   `this.sizer`, then appends `value`.
	 *
	 * @param value - The byte array to encode.
	 * @param target - Omit (along with `offset`) to allocate and return a new
	 *   buffer. Pass a buffer large enough to hold the result to write in place.
	 * @param offset - Byte position within `target` to write at. Required together with `target`.
	 * @returns A new `Uint8Array` when `target` is omitted, otherwise the number of bytes written.
	 * @throws {RangeError} In fixed mode, if `value.length !== options.size`.
	 *
	 * @example
	 * ```ts
	 * const codec = new BytesCodec({ size: 4 });
	 * codec.encode(new Uint8Array([1, 2, 3, 4])); // Uint8Array [1, 2, 3, 4]
	 * codec.encode(new Uint8Array([1, 2]));        // throws RangeError
	 * ```
	 */
	public encoder(value: Uint8Array, target: undefined, offset: undefined): Uint8Array<ArrayBuffer>;
	public encoder(value: Uint8Array, target: Uint8Array, offset: number): number;
	public encoder(value: Uint8Array, target?: Uint8Array, offset?: number): Uint8Array<ArrayBuffer> | number {
		if (this.stride.kind === "fixed") {
			if (value.length !== this.stride.size) {
				throw new RangeError(
					`Expected byte array of length ${this.stride.size}, got ${value.length}`,
				);
			}
			if (target === undefined) {
				const result = new Uint8Array(this.stride.size);
				result.set(value);
				return result;
			}
			target.set(value, offset!);
			return this.stride.size;
		}
		if (target === undefined) {
			const prefix = this.sizer.encode(value.length);
			const result = new Uint8Array(prefix.length + value.length);
			result.set(prefix);
			result.set(value, prefix.length);
			return result;
		}
		const prefixSize = this.sizer.encodeInto(value.length, target, offset!);
		target.set(value, offset! + prefixSize);
		return prefixSize + value.length;
	}

	/**
	 * Decodes a `Uint8Array` starting at `offset` within `data`.
	 *
	 * - **Fixed mode** — returns a zero-copy subarray of the first
	 *   `options.size` bytes.
	 * - **Variable mode** — reads the length prefix via `this.sizer`, then
	 *   returns a zero-copy subarray of the following `length` bytes.
	 *
	 * @param data - Source buffer to read from. May contain trailing bytes
	 *   beyond the encoded value; they are ignored.
	 * @param offset - Byte position to begin reading from.
	 * @returns A tuple `[value, consumed]` where `value` is the decoded byte
	 *   array (a subarray view into `data`) and `consumed` is the total number
	 *   of bytes read (prefix + payload).
	 * @throws {RangeError} In fixed mode, if `data.length - offset < options.size`.
	 *
	 * @example
	 * ```ts
	 * const codec = new BytesCodec({ size: 2 });
	 * const [value, n] = codec.decode(new Uint8Array([0xaa, 0xbb, 0xff]));
	 * // value → Uint8Array [0xaa, 0xbb], n === 2
	 * ```
	 */
	public decoder(data: Uint8Array, offset: number): [Uint8Array, number] {
		if (this.stride.kind === "fixed") {
			if (data.length - offset < this.stride.size) {
				throw new RangeError(
					`Expected at least ${this.stride.size} bytes, got ${data.length - offset}`,
				);
			}
			return [data.subarray(offset, offset + this.stride.size), this.stride.size];
		} else {
			const [length, bytesRead] = this.sizer.decode(data, offset);
			const decoded = data.subarray(offset + bytesRead, offset + bytesRead + length);
			return [decoded, bytesRead + length];
		}
	}
}

/**
 * Default variable-length bytes codec using {@link VarInt} as the length
 * prefix sizer.
 *
 * Equivalent to `new BytesCodec()`. Use this singleton for the common case
 * of encoding arbitrary-length `Uint8Array` values without a fixed size
 * constraint.
 *
 * @example
 * ```ts
 * import { Bytes } from "./bytes.ts";
 *
 * const data = new Uint8Array([1, 2, 3]);
 * const encoded = Bytes.encode(data);          // [0x03, 0x01, 0x02, 0x03]
 * const [decoded, n] = Bytes.decode(encoded);  // [Uint8Array([1,2,3]), 4]
 * ```
 */
export const Bytes: BytesCodec<undefined> = new BytesCodec();
/** Inferred output type for {@link Bytes}. */
export type Bytes = Codec.InferOutput<typeof Bytes>;
