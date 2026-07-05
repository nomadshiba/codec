import { Codec, type Stride } from "./codec.ts";

/**
 * Codec for unsigned variable-length integers using the LEB128 encoding scheme.
 *
 * Each byte contributes 7 bits of data; the most-significant bit (MSB) is a
 * continuation flag (`1` = more bytes follow, `0` = final byte). Smaller values
 * occupy fewer bytes:
 *
 * | Value range        | Bytes used |
 * |--------------------|------------|
 * | 0 – 127            | 1          |
 * | 128 – 16383        | 2          |
 * | 16384 – 2097151    | 3          |
 * | …                  | …          |
 *
 * Values must be non-negative safe integers (`0 ≤ value ≤ Number.MAX_SAFE_INTEGER`).
 * The decoded integer is capped at `Number.MAX_SAFE_INTEGER`; exceeding it throws.
 *
 * @example
 * const bytes = VarInt.encode(300); // Uint8Array [0xAC, 0x02]
 * const [val, size] = VarInt.decode(bytes); // [300, 2]
 */
export class VarIntCodec extends Codec<number> {
	/** Variable stride: byte length depends on the encoded value. */
	public readonly stride: Stride<"variable"> = { kind: "variable" };

	/**
	 * Encodes a non-negative safe integer as a variable-length LEB128 byte sequence.
	 *
	 * @param value - Non-negative safe integer (`0 ≤ value ≤ Number.MAX_SAFE_INTEGER`).
	 * @param target - Omit (along with `offset`) to allocate and return a new buffer.
	 *   Pass a buffer large enough for the encoded output to write in place.
	 * @param offset - Byte position within `target` to write at. Required together with `target`.
	 * @returns A new `Uint8Array` when `target` is omitted, otherwise the number of bytes written.
	 * @throws {RangeError} If `value` is negative or not a safe integer.
	 *
	 * @example
	 * VarInt.encode(1)   // Uint8Array [0x01]  — 1 byte
	 * VarInt.encode(128) // Uint8Array [0x80, 0x01] — 2 bytes
	 */
	public encoder(value: number, target: undefined, offset: undefined): Uint8Array<ArrayBuffer>;
	public encoder(value: number, target: Uint8Array, offset: number): number;
	public encoder(value: number, target?: Uint8Array, offset?: number): Uint8Array<ArrayBuffer> | number {
		if (value < 0 || !Number.isSafeInteger(value)) {
			throw new RangeError("Value must be a non-negative safe integer");
		}
		if (target === undefined) {
			const parts: number[] = [];
			while (value > 0x7F) {
				parts.push((value & 0x7F) | 0x80);
				value = Math.floor(value / 128);
			}
			parts.push(value & 0x7F);
			const result = new Uint8Array(parts.length);
			result.set(parts);
			return result;
		}
		let i = offset!;
		while (value > 0x7F) {
			target[i++] = (value & 0x7F) | 0x80;
			value = Math.floor(value / 128);
		}
		target[i++] = value & 0x7F;
		return i - offset!;
	}

	/**
	 * Decodes a variable-length LEB128 integer starting at `offset`.
	 *
	 * Reads bytes until a byte with a clear MSB is encountered (end of varint).
	 * At most 8 bytes are consumed before the 53-bit JS safe-integer limit is
	 * reached; further bytes trigger a `RangeError`.
	 *
	 * @param data - Buffer to read from. Must contain at least one complete varint starting at `offset`.
	 * @param offset - Byte position to begin reading from.
	 * @returns Tuple of `[value, bytesConsumed]`.
	 * @throws {RangeError} If the decoded value exceeds `Number.MAX_SAFE_INTEGER`.
	 * @throws {RangeError} If the varint encoding is longer than 53 bits (corrupt data).
	 * @throws {Error} If `data` ends before a terminating byte is found (`"Incomplete VarInt"`).
	 *
	 * @example
	 * VarInt.decode(new Uint8Array([0x01]))        // [1, 1]
	 * VarInt.decode(new Uint8Array([0x80, 0x01]))  // [128, 2]
	 */
	public decoder(data: Uint8Array, offset: number): [number, number] {
		let value = 0;
		let shift = 0;
		let bytesRead = 0;
		while (offset + bytesRead < data.length) {
			const byte = data[offset + bytesRead]!;
			value += (byte & 0x7F) * Math.pow(2, shift);
			bytesRead++;
			if ((byte & 0x80) === 0) {
				if (!Number.isSafeInteger(value)) {
					throw new RangeError(
						"Decoded value exceeds MAX_SAFE_INTEGER",
					);
				}
				return [value, bytesRead];
			}
			shift += 7;
			if (shift > 53) {
				throw new RangeError("VarInt too long for JS safe integer");
			}
		}
		throw new Error("Incomplete VarInt");
	}
}

/** Singleton {@link VarIntCodec} instance for unsigned variable-length integer encoding. */
export const VarInt: VarIntCodec = new VarIntCodec();
/** Inferred output type for {@link VarInt}. */
export type VarInt = Codec.InferOutput<typeof VarInt>;

/**
 * Codec for unsigned variable-length integers using the LEB128 encoding scheme,
 * backed by `bigint` for arbitrary precision.
 *
 * Each byte contributes 7 bits of data; the most-significant bit (MSB) is a
 * continuation flag (`1` = more bytes follow, `0` = final byte). Smaller values
 * occupy fewer bytes:
 *
 * | Value range        | Bytes used |
 * |--------------------|------------|
 * | 0 – 127            | 1          |
 * | 128 – 16383        | 2          |
 * | 16384 – 2097151    | 3          |
 * | …                  | …          |
 *
 * Unlike {@link VarIntCodec}, there is no `MAX_SAFE_INTEGER` ceiling: values of
 * any magnitude are supported. Input must be a non-negative integer; a `number`
 * is accepted for convenience and coerced via `BigInt()` (rejecting non-integers).
 *
 * @example
 * const bytes = BigVarInt.encode(300n); // Uint8Array [0xAC, 0x02]
 * const [val, size] = BigVarInt.decode(bytes); // [300n, 2]
 */
export class BigVarIntCodec extends Codec<bigint, bigint | number> {
	/** Variable stride: byte length depends on the encoded value. */
	public readonly stride: Stride<"variable"> = { kind: "variable" };

	/**
	 * Encodes a non-negative integer as a variable-length LEB128 byte sequence.
	 *
	 * @param value - Non-negative integer. A `number` is coerced to `bigint`.
	 * @param target - Omit (along with `offset`) to allocate and return a new buffer.
	 *   Pass a buffer large enough for the encoded output to write in place.
	 * @param offset - Byte position within `target` to write at. Required together with `target`.
	 * @returns A new `Uint8Array` when `target` is omitted, otherwise the number of bytes written.
	 * @throws {RangeError} If `value` is negative.
	 * @throws {RangeError} If `value` is a non-integer `number`.
	 *
	 * @example
	 * BigVarInt.encode(1n)   // Uint8Array [0x01]  — 1 byte
	 * BigVarInt.encode(128n) // Uint8Array [0x80, 0x01] — 2 bytes
	 */
	public encoder(value: bigint | number, target: undefined, offset: undefined): Uint8Array<ArrayBuffer>;
	public encoder(value: bigint | number, target: Uint8Array, offset: number): number;
	public encoder(value: bigint | number, target?: Uint8Array, offset?: number): Uint8Array<ArrayBuffer> | number {
		let v = BigInt(value);
		if (v < 0n) {
			throw new RangeError("Value must be a non-negative integer");
		}
		if (target === undefined) {
			const parts: number[] = [];
			while (v > 0x7Fn) {
				parts.push(Number((v & 0x7Fn) | 0x80n));
				v >>= 7n;
			}
			parts.push(Number(v & 0x7Fn));
			const result = new Uint8Array(parts.length);
			result.set(parts);
			return result;
		}
		let i = offset!;
		while (v > 0x7Fn) {
			target[i++] = Number((v & 0x7Fn) | 0x80n);
			v >>= 7n;
		}
		target[i++] = Number(v & 0x7Fn);
		return i - offset!;
	}

	/**
	 * Decodes a variable-length LEB128 integer starting at `offset`.
	 *
	 * Reads bytes until a byte with a clear MSB is encountered (end of varint).
	 * There is no length cap — the value grows as wide as the encoding requires.
	 *
	 * @param data - Buffer to read from. Must contain at least one complete varint starting at `offset`.
	 * @param offset - Byte position to begin reading from.
	 * @returns Tuple of `[value, bytesConsumed]`.
	 * @throws {Error} If `data` ends before a terminating byte is found (`"Incomplete BigVarInt"`).
	 *
	 * @example
	 * BigVarInt.decode(new Uint8Array([0x01]))        // [1n, 1]
	 * BigVarInt.decode(new Uint8Array([0x80, 0x01]))  // [128n, 2]
	 */
	public decoder(data: Uint8Array, offset: number): [bigint, number] {
		let value = 0n;
		let shift = 0n;
		let bytesRead = 0;
		while (offset + bytesRead < data.length) {
			const byte = data[offset + bytesRead]!;
			value |= BigInt(byte & 0x7F) << shift;
			bytesRead++;
			if ((byte & 0x80) === 0) {
				return [value, bytesRead];
			}
			shift += 7n;
		}
		throw new Error("Incomplete BigVarInt");
	}
}

/** Singleton {@link BigVarIntCodec} instance for unsigned variable-length bigint encoding. */
export const BigVarInt: BigVarIntCodec = new BigVarIntCodec();
/** Inferred output type for {@link BigVarInt}. */
export type BigVarInt = Codec.InferOutput<typeof BigVarInt>;
