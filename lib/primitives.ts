import { Codec, type Stride } from "./codec.ts";

/**
 * Options for multi-byte numeric codecs that support byte-order selection.
 */
export type NumericOptions = {
	/**
	 * Byte order used during encoding and decoding.
	 * - `"be"` – big-endian (default when omitted)
	 * - `"le"` – little-endian
	 */
	endian?: "be" | "le";
};

/**
 * Codec for signed 8-bit integers (`int8_t`).
 *
 * Fixed stride of 1 byte. Wraps values via `DataView.setInt8` / `getInt8`.
 *
 * @example
 * const bytes = I8.encode(-1);        // Uint8Array [0xFF]
 * const [val, size] = I8.decode(bytes); // [-1, 1]
 */
export class I8Codec extends Codec<number> {
	/** Fixed stride: always 1 byte. */
	public readonly stride: Stride<"fixed"> = { kind: "fixed", size: 1 };

	/**
	 * Encodes a signed 8-bit integer.
	 *
	 * @param value - Integer in the range [-128, 127].
	 * @param target - Omit (along with `offset`) to allocate and return a new buffer.
	 *   Pass a buffer with at least 1 byte available at `offset` to write in place.
	 * @param offset - Byte position within `target` to write at. Required together with `target`.
	 * @returns A new `Uint8Array` when `target` is omitted, otherwise the number of bytes written (`1`).
	 */
	public encoder(value: number, target: undefined, offset: undefined): Uint8Array<ArrayBuffer>;
	public encoder(value: number, target: Uint8Array, offset: number): number;
	public encoder(value: number, target?: Uint8Array, offset?: number): Uint8Array<ArrayBuffer> | number {
		if (target === undefined) {
			const arr = new Uint8Array(1);
			new DataView(arr.buffer).setInt8(0, value);
			return arr;
		}
		new DataView(target.buffer, target.byteOffset + offset!, 1).setInt8(0, value);
		return 1;
	}

	/**
	 * Decodes a signed 8-bit integer starting at `offset`.
	 *
	 * @param data - Buffer to read from. Must have at least 1 byte available at `offset`.
	 * @param offset - Byte position to begin reading from.
	 * @returns Tuple of `[value, bytesConsumed]` where `bytesConsumed` is always `1`.
	 */
	public decoder(data: Uint8Array, offset: number): [number, number] {
		const view = new DataView(
			data.buffer,
			data.byteOffset + offset,
			data.byteLength - offset,
		);
		return [view.getInt8(0), 1];
	}
}

/** Default singleton {@link I8Codec} instance for signed 8-bit integers. */
export const I8: I8Codec = new I8Codec();
/** Inferred output type for {@link I8}. */
export type I8 = Codec.InferOutput<typeof I8>;

/**
 * Codec for unsigned 8-bit integers (`uint8_t`).
 *
 * Fixed stride of 1 byte. Wraps values via `DataView.setUint8` / `getUint8`.
 *
 * @example
 * const bytes = U8.encode(255);         // Uint8Array [0xFF]
 * const [val, size] = U8.decode(bytes); // [255, 1]
 */
export class U8Codec extends Codec<number> {
	/** Fixed stride: always 1 byte. */
	public readonly stride: Stride<"fixed"> = { kind: "fixed", size: 1 };

	/**
	 * Encodes an unsigned 8-bit integer.
	 *
	 * @param value - Integer in the range [0, 255].
	 * @param target - Omit (along with `offset`) to allocate and return a new buffer.
	 *   Pass a buffer with at least 1 byte available at `offset` to write in place.
	 * @param offset - Byte position within `target` to write at. Required together with `target`.
	 * @returns A new `Uint8Array` when `target` is omitted, otherwise the number of bytes written (`1`).
	 */
	public encoder(value: number, target: undefined, offset: undefined): Uint8Array<ArrayBuffer>;
	public encoder(value: number, target: Uint8Array, offset: number): number;
	public encoder(value: number, target?: Uint8Array, offset?: number): Uint8Array<ArrayBuffer> | number {
		if (target === undefined) {
			const arr = new Uint8Array(1);
			new DataView(arr.buffer).setUint8(0, value);
			return arr;
		}
		new DataView(target.buffer, target.byteOffset + offset!, 1).setUint8(0, value);
		return 1;
	}

	/**
	 * Decodes an unsigned 8-bit integer starting at `offset`.
	 *
	 * @param data - Buffer to read from. Must have at least 1 byte available at `offset`.
	 * @param offset - Byte position to begin reading from.
	 * @returns Tuple of `[value, bytesConsumed]` where `bytesConsumed` is always `1`.
	 */
	public decoder(data: Uint8Array, offset: number): [number, number] {
		const view = new DataView(
			data.buffer,
			data.byteOffset + offset,
			data.byteLength - offset,
		);
		return [view.getUint8(0), 1];
	}
}

/** Default singleton {@link U8Codec} instance for unsigned 8-bit integers. */
export const U8: U8Codec = new U8Codec();
/** Inferred output type for {@link U8}. */
export type U8 = Codec.InferOutput<typeof U8>;

/**
 * Codec for signed 16-bit integers (`int16_t`).
 *
 * Fixed stride of 2 bytes. Byte order is configurable via {@link NumericOptions}.
 * Defaults to big-endian.
 *
 * @example
 * const beBytes = I16.encode(256);          // big-endian: [0x01, 0x00]
 * const leBytes = I16LE.encode(256);        // little-endian: [0x00, 0x01]
 * const [val] = I16.decode(beBytes);        // [256]
 */
export class I16Codec extends Codec<number> {
	/** Fixed stride: always 2 bytes. */
	public readonly stride: Stride<"fixed"> = { kind: "fixed", size: 2 };
	private readonly littleEndian: boolean;

	/**
	 * @param options - Byte-order options. Defaults to big-endian when omitted.
	 */
	constructor(options?: NumericOptions) {
		super();
		this.littleEndian = options?.endian === "le";
	}

	/**
	 * Encodes a signed 16-bit integer.
	 *
	 * @param value - Integer in the range [-32768, 32767].
	 * @param target - Omit (along with `offset`) to allocate and return a new buffer.
	 *   Pass a buffer with at least 2 bytes available at `offset` to write in place.
	 * @param offset - Byte position within `target` to write at. Required together with `target`.
	 * @returns A new `Uint8Array` when `target` is omitted, otherwise the number of bytes written (`2`).
	 */
	public encoder(value: number, target: undefined, offset: undefined): Uint8Array<ArrayBuffer>;
	public encoder(value: number, target: Uint8Array, offset: number): number;
	public encoder(value: number, target?: Uint8Array, offset?: number): Uint8Array<ArrayBuffer> | number {
		if (target === undefined) {
			const arr = new Uint8Array(2);
			new DataView(arr.buffer).setInt16(0, value, this.littleEndian);
			return arr;
		}
		new DataView(target.buffer, target.byteOffset + offset!, 2).setInt16(0, value, this.littleEndian);
		return 2;
	}

	/**
	 * Decodes a signed 16-bit integer starting at `offset`.
	 *
	 * @param data - Buffer to read from. Must have at least 2 bytes available at `offset`.
	 * @param offset - Byte position to begin reading from.
	 * @returns Tuple of `[value, bytesConsumed]` where `bytesConsumed` is always `2`.
	 */
	public decoder(data: Uint8Array, offset: number): [number, number] {
		const view = new DataView(
			data.buffer,
			data.byteOffset + offset,
			data.byteLength - offset,
		);
		return [view.getInt16(0, this.littleEndian), 2];
	}
}

/** Default big-endian singleton {@link I16Codec} instance for signed 16-bit integers. */
export const I16: I16Codec = new I16Codec();
/** Inferred output type for {@link I16}. */
export type I16 = Codec.InferOutput<typeof I16>;

/**
 * Codec for unsigned 16-bit integers (`uint16_t`).
 *
 * Fixed stride of 2 bytes. Byte order is configurable via {@link NumericOptions}.
 * Defaults to big-endian.
 *
 * @example
 * const beBytes = U16.encode(0xABCD);   // big-endian: [0xAB, 0xCD]
 * const leBytes = U16LE.encode(0xABCD); // little-endian: [0xCD, 0xAB]
 * const [val] = U16.decode(beBytes);    // [0xABCD]
 */
export class U16Codec extends Codec<number> {
	/** Fixed stride: always 2 bytes. */
	public readonly stride: Stride<"fixed"> = { kind: "fixed", size: 2 };
	private readonly littleEndian: boolean;

	/**
	 * @param options - Byte-order options. Defaults to big-endian when omitted.
	 */
	constructor(options?: NumericOptions) {
		super();
		this.littleEndian = options?.endian === "le";
	}

	/**
	 * Encodes an unsigned 16-bit integer.
	 *
	 * @param value - Integer in the range [0, 65535].
	 * @param target - Omit (along with `offset`) to allocate and return a new buffer.
	 *   Pass a buffer with at least 2 bytes available at `offset` to write in place.
	 * @param offset - Byte position within `target` to write at. Required together with `target`.
	 * @returns A new `Uint8Array` when `target` is omitted, otherwise the number of bytes written (`2`).
	 */
	public encoder(value: number, target: undefined, offset: undefined): Uint8Array<ArrayBuffer>;
	public encoder(value: number, target: Uint8Array, offset: number): number;
	public encoder(value: number, target?: Uint8Array, offset?: number): Uint8Array<ArrayBuffer> | number {
		if (target === undefined) {
			const arr = new Uint8Array(2);
			new DataView(arr.buffer).setUint16(0, value, this.littleEndian);
			return arr;
		}
		new DataView(target.buffer, target.byteOffset + offset!, 2).setUint16(0, value, this.littleEndian);
		return 2;
	}

	/**
	 * Decodes an unsigned 16-bit integer starting at `offset`.
	 *
	 * @param data - Buffer to read from. Must have at least 2 bytes available at `offset`.
	 * @param offset - Byte position to begin reading from.
	 * @returns Tuple of `[value, bytesConsumed]` where `bytesConsumed` is always `2`.
	 */
	public decoder(data: Uint8Array, offset: number): [number, number] {
		const view = new DataView(
			data.buffer,
			data.byteOffset + offset,
			data.byteLength - offset,
		);
		return [view.getUint16(0, this.littleEndian), 2];
	}
}

/** Default big-endian singleton {@link U16Codec} instance for unsigned 16-bit integers. */
export const U16: U16Codec = new U16Codec();
/** Inferred output type for {@link U16}. */
export type U16 = Codec.InferOutput<typeof U16>;

/**
 * Codec for signed 32-bit integers (`int32_t`).
 *
 * Fixed stride of 4 bytes. Byte order is configurable via {@link NumericOptions}.
 * Defaults to big-endian.
 *
 * @example
 * const bytes = I32.encode(-1);         // big-endian: [0xFF, 0xFF, 0xFF, 0xFF]
 * const [val] = I32.decode(bytes);      // [-1]
 */
export class I32Codec extends Codec<number> {
	/** Fixed stride: always 4 bytes. */
	public readonly stride: Stride<"fixed"> = { kind: "fixed", size: 4 };
	private readonly littleEndian: boolean;

	/**
	 * @param options - Byte-order options. Defaults to big-endian when omitted.
	 */
	constructor(options?: NumericOptions) {
		super();
		this.littleEndian = options?.endian === "le";
	}

	/**
	 * Encodes a signed 32-bit integer.
	 *
	 * @param value - Integer in the range [-2147483648, 2147483647].
	 * @param target - Omit (along with `offset`) to allocate and return a new buffer.
	 *   Pass a buffer with at least 4 bytes available at `offset` to write in place.
	 * @param offset - Byte position within `target` to write at. Required together with `target`.
	 * @returns A new `Uint8Array` when `target` is omitted, otherwise the number of bytes written (`4`).
	 */
	public encoder(value: number, target: undefined, offset: undefined): Uint8Array<ArrayBuffer>;
	public encoder(value: number, target: Uint8Array, offset: number): number;
	public encoder(value: number, target?: Uint8Array, offset?: number): Uint8Array<ArrayBuffer> | number {
		if (target === undefined) {
			const arr = new Uint8Array(4);
			new DataView(arr.buffer).setInt32(0, value, this.littleEndian);
			return arr;
		}
		new DataView(target.buffer, target.byteOffset + offset!, 4).setInt32(0, value, this.littleEndian);
		return 4;
	}

	/**
	 * Decodes a signed 32-bit integer starting at `offset`.
	 *
	 * @param data - Buffer to read from. Must have at least 4 bytes available at `offset`.
	 * @param offset - Byte position to begin reading from.
	 * @returns Tuple of `[value, bytesConsumed]` where `bytesConsumed` is always `4`.
	 */
	public decoder(data: Uint8Array, offset: number): [number, number] {
		const view = new DataView(
			data.buffer,
			data.byteOffset + offset,
			data.byteLength - offset,
		);
		return [view.getInt32(0, this.littleEndian), 4];
	}
}

/** Default big-endian singleton {@link I32Codec} instance for signed 32-bit integers. */
export const I32: I32Codec = new I32Codec();
/** Inferred output type for {@link I32}. */
export type I32 = Codec.InferOutput<typeof I32>;

/**
 * Codec for unsigned 32-bit integers (`uint32_t`).
 *
 * Fixed stride of 4 bytes. Byte order is configurable via {@link NumericOptions}.
 * Defaults to big-endian.
 *
 * @example
 * const bytes = U32.encode(0xDEADBEEF);  // big-endian: [0xDE, 0xAD, 0xBE, 0xEF]
 * const [val] = U32.decode(bytes);       // [0xDEADBEEF]
 */
export class U32Codec extends Codec<number> {
	/** Fixed stride: always 4 bytes. */
	public readonly stride: Stride<"fixed"> = { kind: "fixed", size: 4 };
	private readonly littleEndian: boolean;

	/**
	 * @param options - Byte-order options. Defaults to big-endian when omitted.
	 */
	constructor(options?: NumericOptions) {
		super();
		this.littleEndian = options?.endian === "le";
	}

	/**
	 * Encodes an unsigned 32-bit integer.
	 *
	 * @param value - Integer in the range [0, 4294967295].
	 * @param target - Omit (along with `offset`) to allocate and return a new buffer.
	 *   Pass a buffer with at least 4 bytes available at `offset` to write in place.
	 * @param offset - Byte position within `target` to write at. Required together with `target`.
	 * @returns A new `Uint8Array` when `target` is omitted, otherwise the number of bytes written (`4`).
	 */
	public encoder(value: number, target: undefined, offset: undefined): Uint8Array<ArrayBuffer>;
	public encoder(value: number, target: Uint8Array, offset: number): number;
	public encoder(value: number, target?: Uint8Array, offset?: number): Uint8Array<ArrayBuffer> | number {
		if (target === undefined) {
			const arr = new Uint8Array(4);
			new DataView(arr.buffer).setUint32(0, value, this.littleEndian);
			return arr;
		}
		new DataView(target.buffer, target.byteOffset + offset!, 4).setUint32(0, value, this.littleEndian);
		return 4;
	}

	/**
	 * Decodes an unsigned 32-bit integer starting at `offset`.
	 *
	 * @param data - Buffer to read from. Must have at least 4 bytes available at `offset`.
	 * @param offset - Byte position to begin reading from.
	 * @returns Tuple of `[value, bytesConsumed]` where `bytesConsumed` is always `4`.
	 */
	public decoder(data: Uint8Array, offset: number): [number, number] {
		const view = new DataView(
			data.buffer,
			data.byteOffset + offset,
			data.byteLength - offset,
		);
		return [view.getUint32(0, this.littleEndian), 4];
	}
}

/** Default big-endian singleton {@link U32Codec} instance for unsigned 32-bit integers. */
export const U32: U32Codec = new U32Codec();
/** Inferred output type for {@link U32}. */
export type U32 = Codec.InferOutput<typeof U32>;

/**
 * Codec for signed 64-bit integers (`int64_t`) using JavaScript `bigint`.
 *
 * Fixed stride of 8 bytes. Byte order is configurable via {@link NumericOptions}.
 * Defaults to big-endian. Use `bigint` literals (e.g. `42n`) for values.
 *
 * @example
 * const bytes = I64.encode(-1n);        // big-endian: 8 bytes of 0xFF
 * const [val] = I64.decode(bytes);      // [-1n]
 */
export class I64Codec extends Codec<bigint, bigint | number> {
	/** Fixed stride: always 8 bytes. */
	public readonly stride: Stride<"fixed"> = { kind: "fixed", size: 8 };
	private readonly littleEndian: boolean;

	/**
	 * @param options - Byte-order options. Defaults to big-endian when omitted.
	 */
	constructor(options?: NumericOptions) {
		super();
		this.littleEndian = options?.endian === "le";
	}

	/**
	 * Encodes a signed 64-bit `bigint`.
	 *
	 * @param value - `bigint` (or `number`) in the range [-2^63, 2^63 - 1].
	 * @param target - Omit (along with `offset`) to allocate and return a new buffer.
	 *   Pass a buffer with at least 8 bytes available at `offset` to write in place.
	 * @param offset - Byte position within `target` to write at. Required together with `target`.
	 * @returns A new `Uint8Array` when `target` is omitted, otherwise the number of bytes written (`8`).
	 */
	public encoder(value: bigint | number, target: undefined, offset: undefined): Uint8Array<ArrayBuffer>;
	public encoder(value: bigint | number, target: Uint8Array, offset: number): number;
	public encoder(value: bigint | number, target?: Uint8Array, offset?: number): Uint8Array<ArrayBuffer> | number {
		if (target === undefined) {
			const arr = new Uint8Array(8);
			new DataView(arr.buffer).setBigInt64(0, BigInt(value), this.littleEndian);
			return arr;
		}
		new DataView(target.buffer, target.byteOffset + offset!, 8).setBigInt64(0, BigInt(value), this.littleEndian);
		return 8;
	}

	/**
	 * Decodes a signed 64-bit `bigint` starting at `offset`.
	 *
	 * @param data - Buffer to read from. Must have at least 8 bytes available at `offset`.
	 * @param offset - Byte position to begin reading from.
	 * @returns Tuple of `[value, bytesConsumed]` where `bytesConsumed` is always `8`.
	 */
	public decoder(data: Uint8Array, offset: number): [bigint, number] {
		const view = new DataView(
			data.buffer,
			data.byteOffset + offset,
			data.byteLength - offset,
		);
		return [view.getBigInt64(0, this.littleEndian), 8];
	}
}

/** Default big-endian singleton {@link I64Codec} instance for signed 64-bit integers. */
export const I64: I64Codec = new I64Codec();
/** Inferred output type for {@link I64}. */
export type I64 = Codec.InferOutput<typeof I64>;

/**
 * Codec for unsigned 64-bit integers (`uint64_t`) using JavaScript `bigint`.
 *
 * Fixed stride of 8 bytes. Byte order is configurable via {@link NumericOptions}.
 * Defaults to big-endian. Use `bigint` literals (e.g. `42n`) for values.
 *
 * @example
 * const bytes = U64.encode(0xDEADBEEFCAFEBABEn);
 * const [val] = U64.decode(bytes); // [0xDEADBEEFCAFEBABEn]
 */
export class U64Codec extends Codec<bigint, bigint | number> {
	/** Fixed stride: always 8 bytes. */
	public readonly stride: Stride<"fixed"> = { kind: "fixed", size: 8 };
	private readonly littleEndian: boolean;

	/**
	 * @param options - Byte-order options. Defaults to big-endian when omitted.
	 */
	constructor(options?: NumericOptions) {
		super();
		this.littleEndian = options?.endian === "le";
	}

	/**
	 * Encodes an unsigned 64-bit `bigint`.
	 *
	 * @param value - `bigint` (or `number`) in the range [0, 2^64 - 1].
	 * @param target - Omit (along with `offset`) to allocate and return a new buffer.
	 *   Pass a buffer with at least 8 bytes available at `offset` to write in place.
	 * @param offset - Byte position within `target` to write at. Required together with `target`.
	 * @returns A new `Uint8Array` when `target` is omitted, otherwise the number of bytes written (`8`).
	 */
	public encoder(value: bigint | number, target: undefined, offset: undefined): Uint8Array<ArrayBuffer>;
	public encoder(value: bigint | number, target: Uint8Array, offset: number): number;
	public encoder(value: bigint | number, target?: Uint8Array, offset?: number): Uint8Array<ArrayBuffer> | number {
		if (target === undefined) {
			const arr = new Uint8Array(8);
			new DataView(arr.buffer).setBigUint64(0, BigInt(value), this.littleEndian);
			return arr;
		}
		new DataView(target.buffer, target.byteOffset + offset!, 8).setBigUint64(0, BigInt(value), this.littleEndian);
		return 8;
	}

	/**
	 * Decodes an unsigned 64-bit `bigint` starting at `offset`.
	 *
	 * @param data - Buffer to read from. Must have at least 8 bytes available at `offset`.
	 * @param offset - Byte position to begin reading from.
	 * @returns Tuple of `[value, bytesConsumed]` where `bytesConsumed` is always `8`.
	 */
	public decoder(data: Uint8Array, offset: number): [bigint, number] {
		const view = new DataView(
			data.buffer,
			data.byteOffset + offset,
			data.byteLength - offset,
		);
		return [view.getBigUint64(0, this.littleEndian), 8];
	}
}

/** Default big-endian singleton {@link U64Codec} instance for unsigned 64-bit integers. */
export const U64: U64Codec = new U64Codec();
/** Inferred output type for {@link U64}. */
export type U64 = Codec.InferOutput<typeof U64>;

/**
 * Codec for IEEE 754 single-precision (32-bit) floating-point numbers.
 *
 * Fixed stride of 4 bytes. Byte order is configurable via {@link NumericOptions}.
 * Defaults to big-endian. Note: precision is limited to ~7 significant decimal digits.
 *
 * @example
 * const bytes = F32.encode(1.5);       // big-endian IEEE 754
 * const [val] = F32.decode(bytes);     // [1.5]
 */
export class F32Codec extends Codec<number, number | bigint> {
	/** Fixed stride: always 4 bytes. */
	public readonly stride: Stride<"fixed"> = { kind: "fixed", size: 4 };
	private readonly littleEndian: boolean;

	/**
	 * @param options - Byte-order options. Defaults to big-endian when omitted.
	 */
	constructor(options?: NumericOptions) {
		super();
		this.littleEndian = options?.endian === "le";
	}

	/**
	 * Encodes a 32-bit float.
	 *
	 * @param value - The number to encode. Precision may be lost (float32 ~7 significant digits).
	 * @param target - Omit (along with `offset`) to allocate and return a new buffer.
	 *   Pass a buffer with at least 4 bytes available at `offset` to write in place.
	 * @param offset - Byte position within `target` to write at. Required together with `target`.
	 * @returns A new `Uint8Array` when `target` is omitted, otherwise the number of bytes written (`4`).
	 */
	public encoder(value: number | bigint, target: undefined, offset: undefined): Uint8Array<ArrayBuffer>;
	public encoder(value: number | bigint, target: Uint8Array, offset: number): number;
	public encoder(value: number | bigint, target?: Uint8Array, offset?: number): Uint8Array<ArrayBuffer> | number {
		if (target === undefined) {
			const arr = new Uint8Array(4);
			new DataView(arr.buffer).setFloat32(0, Number(value), this.littleEndian);
			return arr;
		}
		new DataView(target.buffer, target.byteOffset + offset!, 4).setFloat32(0, Number(value), this.littleEndian);
		return 4;
	}

	/**
	 * Decodes a 32-bit float starting at `offset`.
	 *
	 * @param data - Buffer to read from. Must have at least 4 bytes available at `offset`.
	 * @param offset - Byte position to begin reading from.
	 * @returns Tuple of `[value, bytesConsumed]` where `bytesConsumed` is always `4`.
	 */
	public decoder(data: Uint8Array, offset: number): [number, number] {
		const view = new DataView(
			data.buffer,
			data.byteOffset + offset,
			data.byteLength - offset,
		);
		return [view.getFloat32(0, this.littleEndian), 4];
	}
}

/** Default big-endian singleton {@link F32Codec} instance for 32-bit floats. */
export const F32: F32Codec = new F32Codec();
/** Inferred output type for {@link F32}. */
export type F32 = Codec.InferOutput<typeof F32>;

/**
 * Codec for IEEE 754 double-precision (64-bit) floating-point numbers.
 *
 * Fixed stride of 8 bytes. Byte order is configurable via {@link NumericOptions}.
 * Defaults to big-endian. Matches JavaScript's native `number` precision.
 *
 * @example
 * const bytes = F64.encode(Math.PI);   // big-endian IEEE 754
 * const [val] = F64.decode(bytes);     // [Math.PI]
 */
export class F64Codec extends Codec<number, number | bigint> {
	/** Fixed stride: always 8 bytes. */
	public readonly stride: Stride<"fixed"> = { kind: "fixed", size: 8 };
	private readonly littleEndian: boolean;

	/**
	 * @param options - Byte-order options. Defaults to big-endian when omitted.
	 */
	constructor(options?: NumericOptions) {
		super();
		this.littleEndian = options?.endian === "le";
	}

	/**
	 * Encodes a 64-bit double.
	 *
	 * @param value - Any JavaScript `number` (full double precision).
	 * @param target - Omit (along with `offset`) to allocate and return a new buffer.
	 *   Pass a buffer with at least 8 bytes available at `offset` to write in place.
	 * @param offset - Byte position within `target` to write at. Required together with `target`.
	 * @returns A new `Uint8Array` when `target` is omitted, otherwise the number of bytes written (`8`).
	 */
	public encoder(value: number | bigint, target: undefined, offset: undefined): Uint8Array<ArrayBuffer>;
	public encoder(value: number | bigint, target: Uint8Array, offset: number): number;
	public encoder(value: number | bigint, target?: Uint8Array, offset?: number): Uint8Array<ArrayBuffer> | number {
		if (target === undefined) {
			const arr = new Uint8Array(8);
			new DataView(arr.buffer).setFloat64(0, Number(value), this.littleEndian);
			return arr;
		}
		new DataView(target.buffer, target.byteOffset + offset!, 8).setFloat64(0, Number(value), this.littleEndian);
		return 8;
	}

	/**
	 * Decodes a 64-bit double starting at `offset`.
	 *
	 * @param data - Buffer to read from. Must have at least 8 bytes available at `offset`.
	 * @param offset - Byte position to begin reading from.
	 * @returns Tuple of `[value, bytesConsumed]` where `bytesConsumed` is always `8`.
	 */
	public decoder(data: Uint8Array, offset: number): [number, number] {
		const view = new DataView(
			data.buffer,
			data.byteOffset + offset,
			data.byteLength - offset,
		);
		return [view.getFloat64(0, this.littleEndian), 8];
	}
}

/** Default big-endian singleton {@link F64Codec} instance for 64-bit doubles. */
export const F64: F64Codec = new F64Codec();
/** Inferred output type for {@link F64}. */
export type F64 = Codec.InferOutput<typeof F64>;

/**
 * Codec for boolean values encoded as a single byte.
 *
 * Fixed stride of 1 byte. Encodes `true` as `0x01`, `false` as `0x00`.
 * Any non-zero byte decodes as `true`.
 *
 * @example
 * Bool.encode(true);              // Uint8Array [0x01]
 * Bool.encode(false);             // Uint8Array [0x00]
 * Bool.decode(new Uint8Array([2])); // [true, 1]
 */
export class BoolCodec extends Codec<boolean> {
	/** Fixed stride: always 1 byte. */
	public readonly stride: Stride<"fixed"> = { kind: "fixed", size: 1 };

	/**
	 * Encodes a boolean into a single byte.
	 *
	 * @param value - `true` → `0x01`, `false` → `0x00`.
	 * @param target - Omit (along with `offset`) to allocate and return a new buffer.
	 *   Pass a buffer with at least 1 byte available at `offset` to write in place.
	 * @param offset - Byte position within `target` to write at. Required together with `target`.
	 * @returns A new `Uint8Array` when `target` is omitted, otherwise the number of bytes written (`1`).
	 */
	public encoder(value: boolean, target: undefined, offset: undefined): Uint8Array<ArrayBuffer>;
	public encoder(value: boolean, target: Uint8Array, offset: number): number;
	public encoder(value: boolean, target?: Uint8Array, offset?: number): Uint8Array<ArrayBuffer> | number {
		if (target === undefined) {
			const arr = new Uint8Array(1);
			arr[0] = value ? 1 : 0;
			return arr;
		}
		target[offset!] = value ? 1 : 0;
		return 1;
	}

	/**
	 * Decodes a boolean from the byte at `offset`.
	 *
	 * @param data - Buffer to read from. Must have at least 1 byte available at `offset`.
	 * @param offset - Byte position to begin reading from.
	 * @returns Tuple of `[value, bytesConsumed]` where `bytesConsumed` is always `1`.
	 *          Any non-zero byte yields `true`.
	 */
	public decoder(data: Uint8Array, offset: number): [boolean, number] {
		return [data[offset] !== 0, 1];
	}
}

/** Singleton {@link BoolCodec} instance for boolean values. */
export const Bool: BoolCodec = new BoolCodec();
/** Inferred output type for {@link Bool}. */
export type Bool = Codec.InferOutput<typeof Bool>;

// ── Little-endian singletons ─────────────────────────────────────────────────

/** Little-endian singleton {@link I16Codec} instance for signed 16-bit integers. */
export const I16LE: I16Codec = new I16Codec({ endian: "le" });
/** Inferred output type for {@link I16LE}. */
export type I16LE = Codec.InferOutput<typeof I16LE>;

/** Little-endian singleton {@link U16Codec} instance for unsigned 16-bit integers. */
export const U16LE: U16Codec = new U16Codec({ endian: "le" });
/** Inferred output type for {@link U16LE}. */
export type U16LE = Codec.InferOutput<typeof U16LE>;

/** Little-endian singleton {@link I32Codec} instance for signed 32-bit integers. */
export const I32LE: I32Codec = new I32Codec({ endian: "le" });
/** Inferred output type for {@link I32LE}. */
export type I32LE = Codec.InferOutput<typeof I32LE>;

/** Little-endian singleton {@link U32Codec} instance for unsigned 32-bit integers. */
export const U32LE: U32Codec = new U32Codec({ endian: "le" });
/** Inferred output type for {@link U32LE}. */
export type U32LE = Codec.InferOutput<typeof U32LE>;

/** Little-endian singleton {@link I64Codec} instance for signed 64-bit integers. */
export const I64LE: I64Codec = new I64Codec({ endian: "le" });
/** Inferred output type for {@link I64LE}. */
export type I64LE = Codec.InferOutput<typeof I64LE>;

/** Little-endian singleton {@link U64Codec} instance for unsigned 64-bit integers. */
export const U64LE: U64Codec = new U64Codec({ endian: "le" });
/** Inferred output type for {@link U64LE}. */
export type U64LE = Codec.InferOutput<typeof U64LE>;

/** Little-endian singleton {@link F32Codec} instance for 32-bit floats. */
export const F32LE: F32Codec = new F32Codec({ endian: "le" });
/** Inferred output type for {@link F32LE}. */
export type F32LE = Codec.InferOutput<typeof F32LE>;

/** Little-endian singleton {@link F64Codec} instance for 64-bit doubles. */
export const F64LE: F64Codec = new F64Codec({ endian: "le" });
/** Inferred output type for {@link F64LE}. */
export type F64LE = Codec.InferOutput<typeof F64LE>;

/**
 * Codec for void / no-op values.
 *
 * Fixed stride of 0 bytes. Encodes nothing and decodes nothing — always returns
 * `undefined` consuming zero bytes. Useful as a placeholder in composite codecs
 * or to represent fields that carry no data.
 *
 * @example
 * const bytes = Void.encode(undefined); // Uint8Array []
 * const [val, size] = Void.decode(new Uint8Array([1, 2])); // [undefined, 0]
 */
export class VoidCodec extends Codec<void, null | undefined | void> {
	/** Fixed stride: always 0 bytes. */
	public override readonly stride: Stride<"fixed"> = { kind: "fixed", size: 0 };

	/**
	 * No-op encode — writes nothing.
	 *
	 * @param _value - Ignored. Accepts `void`, `null`, or `undefined`.
	 * @param target - Omit (along with `offset`) to receive a new empty (zero-length) `Uint8Array`.
	 * @param offset - Ignored when `target` is provided.
	 * @returns An empty `Uint8Array` when `target` is omitted, otherwise `0` (bytes written).
	 */
	public override encoder(value: void | null | undefined, target: undefined, offset: undefined): Uint8Array<ArrayBuffer>;
	public override encoder(value: void | null | undefined, target: Uint8Array, offset: number): number;
	public override encoder(_value: void | null | undefined, target?: Uint8Array, _offset?: number): Uint8Array<ArrayBuffer> | number {
		if (target === undefined) return new Uint8Array(0);
		return 0;
	}

	/**
	 * No-op decode — always returns `undefined` consuming 0 bytes.
	 *
	 * @param _data - Ignored.
	 * @param _offset - Ignored.
	 * @returns Tuple `[undefined, 0]`.
	 */
	public override decoder(_data: Uint8Array, _offset: number): [void, number] {
		return [void 0, 0];
	}
}

/** Singleton {@link VoidCodec} instance for no-op / zero-byte encoding. */
export const Void: VoidCodec = new VoidCodec();
/** Inferred output type for {@link Void}. */
export type Void = Codec.InferOutput<typeof Void>;
