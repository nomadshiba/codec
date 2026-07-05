import { Codec, type Stride } from "../codec.ts";
import { ArrayCodec } from "./array.ts";
import { TupleCodec } from "./tuple.ts";

// ── Mapping ───────────────────────────────────────────────────────────────────

/**
 * A `[keyCodec, valueCodec]` pair that describes the codecs used for the keys
 * and values of a {@link MappingCodec}.
 */
export type MappingGeneric = readonly [Codec, Codec];

/**
 * Derives the encode-side (input) `Map` type from a {@link MappingGeneric}
 * codec pair.
 *
 * @template T - A `[keyCodec, valueCodec]` tuple.
 */
export type MappingInput<T extends MappingGeneric> = Map<
	Codec.InferInput<T[0]>,
	Codec.InferInput<T[1]>
>;

/**
 * Derives the decode-side (output) `Map` type from a {@link MappingGeneric}
 * codec pair.
 *
 * @template T - A `[keyCodec, valueCodec]` tuple.
 */
export type MappingOutput<T extends MappingGeneric> = Map<
	Codec.InferOutput<T[0]>,
	Codec.InferOutput<T[1]>
>;

/**
 * Options for {@link MappingCodec}.
 */
export type MappingOptions = {
	/**
	 * Codec used to encode/decode the entry count prefix.
	 * Defaults to `VarInt` (via the underlying {@link ArrayCodec}).
	 */
	counter: Codec<number>;
};

/**
 * Codec for a `Map<K, V>` — a variable-length sequence of key-value pairs.
 *
 * **Wire format:** a length-prefixed array of `[key, value]` tuples. The
 * count prefix codec defaults to `VarInt` but can be overridden via
 * `options.counter`.
 *
 * The `stride` is always `"variable"`.
 *
 * @template T - A `[keyCodec, valueCodec]` tuple (a {@link MappingGeneric}).
 *
 * @example
 * const codec = new MappingCodec([Utf8, U32]);
 *
 * const bytes = codec.encode(new Map([["foo", 1], ["bar", 2]]));
 * const [map] = codec.decode(bytes);
 * // map.get("foo") === 1
 */
export class MappingCodec<const T extends MappingGeneric> extends Codec<MappingOutput<T>, MappingInput<T>> {
	public readonly stride: Stride<"variable"> = { kind: "variable" };
	private readonly entriesCodec: ArrayCodec<TupleCodec<T>, { counter: MappingOptions["counter"] }>;

	/**
	 * The `[keyCodec, valueCodec]` tuple used for individual map entries.
	 * Exposes the inner entry codec pair for inspection or reuse.
	 */
	public get entryCodec(): T {
		return this.entriesCodec.item.items;
	}

	constructor(entryCodec: T, options?: MappingOptions) {
		super();
		this.entriesCodec = new ArrayCodec(new TupleCodec(entryCodec), options);
	}

	/**
	 * Encodes a `Map` into a length-prefixed sequence of encoded key-value pairs.
	 *
	 * @param value - The `Map` to encode.
	 * @param target - Omit (along with `offset`) to allocate and return a new
	 *   buffer. Pass a buffer to write in place.
	 * @param offset - Byte position within `target` to write at. Required together with `target`.
	 * @returns A new `Uint8Array` when `target` is omitted, otherwise the number of bytes written.
	 *
	 * @example
	 * const bytes = codec.encode(new Map([["a", 1]]));
	 */
	public encoder(value: MappingInput<T>, target: undefined, offset: undefined): Uint8Array<ArrayBuffer>;
	public encoder(value: MappingInput<T>, target: Uint8Array, offset: number): number;
	public encoder(value: MappingInput<T>, target?: Uint8Array, offset?: number): Uint8Array<ArrayBuffer> | number {
		if (target === undefined) return this.entriesCodec.encode(value.entries().toArray() as never);
		return this.entriesCodec.encodeInto(value.entries().toArray() as never, target, offset!);
	}

	/**
	 * Decodes a length-prefixed sequence of key-value pairs into a `Map`.
	 *
	 * @param data - Byte array to decode from.
	 * @param offset - Byte position to begin reading from.
	 * @returns A tuple of `[Map, bytes consumed]`.
	 *
	 * @example
	 * const [map, bytesRead] = codec.decode(bytes);
	 */
	public decoder(data: Uint8Array, offset: number): [MappingOutput<T>, number] {
		const [entries, size] = this.entriesCodec.decode(data, offset);
		return [new Map(entries), size];
	}
}
