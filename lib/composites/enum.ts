import { Codec, type Stride } from "../codec.ts";
import { U8Codec } from "../primitives.ts";

// ── Enum ──────────────────────────────────────────────────────────────────────

/**
 * A record mapping variant names to their associated payload codecs.
 * Each key becomes a possible `kind` discriminant in the encoded enum.
 *
 * @example
 * const variants = {
 *   Move: new StructCodec({ x: I32, y: I32 }),
 *   Quit: NullCodec,
 * } satisfies EnumGeneric;
 */
export type EnumGeneric = { readonly [key: string]: Codec };

/**
 * Derives the encode-side (input) discriminated-union type from an
 * {@link EnumGeneric} variants map.
 *
 * Each member has a `kind` discriminant equal to the variant key and a
 * `value` typed as the codec's input type.
 *
 * @template T - The variants map.
 */
export type EnumInput<T extends EnumGeneric> = {
	-readonly [K in keyof T]: {
		kind: K;
		value: Codec.InferInput<T[K]>;
	};
}[keyof T];

/**
 * Derives the decode-side (output) discriminated-union type from an
 * {@link EnumGeneric} variants map.
 *
 * Each member has a `kind` discriminant equal to the variant key and a
 * `value` typed as the codec's output type.
 *
 * @template T - The variants map.
 */
export type EnumOutput<T extends EnumGeneric> = {
	-readonly [K in keyof T]: {
		kind: K;
		value: Codec.InferOutput<T[K]>;
	};
}[keyof T];

/**
 * Options for {@link EnumCodec}.
 */
export type EnumOptions = {
	/**
	 * Codec used to encode/decode the variant index prefix.
	 * Defaults to {@link U8Codec} (0–255 variants).
	 */
	indexer?: Codec<number>;
};

/**
 * Codec for a tagged-union / discriminated enum with variable-size variants.
 *
 * **Wire format:** `[variantIndex][encodedVariantPayload]`
 *
 * The variant index is encoded by `options.indexer` (default: `U8`). The
 * payload is encoded by the codec registered for the selected variant. Because
 * different variants may have different payload sizes the total stride is
 * always `"variable"`.
 *
 * @template T - The variants map (an {@link EnumGeneric}).
 *
 * @example
 * const ShapeCodec = new EnumCodec({
 *   Circle: new StructCodec({ radius: F32 }),
 *   Rect:   new StructCodec({ w: F32, h: F32 }),
 * });
 *
 * const bytes = ShapeCodec.encode({ kind: "Circle", value: { radius: 5 } });
 * const [shape] = ShapeCodec.decode(bytes);
 * // shape.kind === "Circle", shape.value.radius === 5
 */
export class EnumCodec<const T extends EnumGeneric> extends Codec<EnumOutput<T>, EnumInput<T>> {
	public readonly stride: Stride<"variable"> = { kind: "variable" };

	/** The variants map passed to the constructor. */
	public readonly variants: T;
	/** The codec used to encode/decode the variant index. */
	public readonly indexer: Codec<number>;
	private readonly keys: (keyof T)[];

	constructor(variants: T, options?: EnumOptions) {
		super();
		this.variants = variants;
		this.keys = Object.keys(this.variants) as (keyof T)[];
		this.indexer = options?.indexer ?? new U8Codec();
	}

	/**
	 * Encodes a discriminated-union value into bytes.
	 *
	 * Writes the variant index followed by the encoded payload.
	 *
	 * @param value - Object with a `kind` discriminant and matching `value`.
	 * @param target - Omit (along with `offset`) to allocate and return a new
	 *   buffer. Pass a buffer to write in place.
	 * @param offset - Byte position within `target` to write at. Required together with `target`.
	 * @returns A new `Uint8Array` when `target` is omitted, otherwise the number of bytes written.
	 *
	 * @throws {Error} If `value.kind` is not a registered variant key.
	 *   Message: `"Invalid union variant: <kind>"`.
	 *
	 * @example
	 * const bytes = codec.encode({ kind: "Quit", value: null });
	 */
	public encoder(value: EnumInput<T>, target: undefined, offset: undefined): Uint8Array<ArrayBuffer>;
	public encoder(value: EnumInput<T>, target: Uint8Array, offset: number): number;
	public encoder(value: EnumInput<T>, target?: Uint8Array, offset?: number): Uint8Array<ArrayBuffer> | number {
		const index = this.keys.indexOf(value.kind);
		if (index === -1) {
			throw new Error(`Invalid union variant: ${String(value.kind)}`);
		}
		if (target === undefined) {
			const indexBytes = this.indexer.encode(index);
			const payload = this.variants[value.kind]!.encode(value.value as never);
			const result = new Uint8Array(indexBytes.length + payload.length);
			result.set(indexBytes);
			result.set(payload, indexBytes.length);
			return result;
		}
		const indexSize = this.indexer.encodeInto(index, target, offset!);
		return indexSize + this.variants[value.kind]!.encodeInto(value.value as never, target, offset! + indexSize);
	}

	/**
	 * Decodes bytes into a discriminated-union output value.
	 *
	 * Reads the variant index, looks up the corresponding codec, then decodes
	 * the payload.
	 *
	 * @param data - Byte array to decode from.
	 * @param offset - Byte position to begin reading from.
	 * @returns A tuple of `[{ kind, value }, bytes consumed]`.
	 *
	 * @throws {Error} If the decoded index is out of range.
	 *   Message: `"Invalid union index: <index>"`.
	 *
	 * @example
	 * const [shape, bytesRead] = ShapeCodec.decode(bytes);
	 * if (shape.kind === "Circle") { ... }
	 */
	public decoder(data: Uint8Array, offset: number): [EnumOutput<T>, number] {
		const [index, indexSize] = this.indexer.decode(data, offset);
		if (index >= this.keys.length) {
			throw new Error(`Invalid union index: ${index}`);
		}
		const key = this.keys[index]!;
		const codec = this.variants[key]!;
		const [value, size] = codec.decode(data, offset + indexSize);
		return [{ kind: key, value } as never, indexSize + size];
	}
}
