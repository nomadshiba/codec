import { Codec, type Stride } from "../codec.ts";

// ── Model ─────────────────────────────────────────────────────────────────────

/**
 * A record of named codec fields. Keys ending with `?` denote optional fields.
 *
 * @example
 * const shape = {
 *   name: Utf8,
 *   "age?": U8,
 * } satisfies ModelGeneric;
 */
export type ModelGeneric = { readonly [key: string]: Codec };

type OptionalKeys<T extends ModelGeneric> = {
	[K in Extract<keyof T, string>]: K extends `${infer Base}?` ? Base : never;
}[Extract<keyof T, string>];

type RequiredKeys<T extends ModelGeneric> = {
	[K in Extract<keyof T, string>]: K extends `${string}?` ? never : K;
}[Extract<keyof T, string>];

type OptionalCodecFor<
	T extends ModelGeneric,
	Base extends string,
> = `${Base}?` extends keyof T ? T[`${Base}?`] : never;

/**
 * Derives the encode-side (input) object type from a {@link ModelGeneric} shape.
 *
 * Required fields (no `?` suffix on key) are mandatory. Optional fields (`?`
 * suffix) become optional properties with the `?` stripped from their name.
 *
 * @template T - The model shape.
 */
export type ModelInput<T extends ModelGeneric> =
	& { -readonly [K in RequiredKeys<T>]: Codec.InferInput<T[K]> }
	& {
		-readonly [K in OptionalKeys<T>]?: Codec.InferInput<
			OptionalCodecFor<T, K>
		>;
	};

/**
 * Derives the decode-side (output) object type from a {@link ModelGeneric} shape.
 *
 * Required fields are always present; optional fields (`?` suffix) may be
 * absent. The `?` is stripped from property names in the resulting type.
 *
 * @template T - The model shape.
 */
export type ModelOutput<T extends ModelGeneric> =
	& { -readonly [K in RequiredKeys<T>]: Codec.InferOutput<T[K]> }
	& {
		-readonly [K in OptionalKeys<T>]?: Codec.InferOutput<
			OptionalCodecFor<T, K>
		>;
	};

/**
 * Converts every field of a {@link ModelGeneric} shape into an optional field
 * (appends `?` to any key that does not already have one).
 *
 * Used by {@link ModelCodec.partial} to produce a fully-optional variant of a
 * model shape.
 *
 * @template T - The source model shape.
 */
export type PartialShape<T extends ModelGeneric> = {
	[K in Extract<keyof T, string> as K extends `${string}?` ? K : `${K}?`]: T[K];
};

/**
 * Codec for a named-field struct where individual fields may be marked optional
 * by appending `?` to their key in the shape definition.
 *
 * **Optional-field wire format:** each optional field is prefixed by a single
 * presence byte (`0x01` = present, `0x00` = absent). When absent the field
 * value is omitted entirely from the byte stream.
 *
 * The `stride` is `"fixed"` only when every field has a fixed-size codec *and*
 * no optional fields exist; otherwise it is `"variable"`.
 *
 * @template T - The model shape (a {@link ModelGeneric}).
 *
 * @example
 * const PersonCodec = new ModelCodec({
 *   name: Utf8,
 *   "nickname?": Utf8,
 *   age: U8,
 * });
 *
 * const bytes = PersonCodec.encode({ name: "Alice", age: 30 });
 * const [person] = PersonCodec.decode(bytes);
 * // person.name === "Alice", person.age === 30, person.nickname === undefined
 */
export class ModelCodec<const T extends ModelGeneric> extends Codec<ModelOutput<T>, ModelInput<T>> {
	public readonly stride: { [K in keyof T]: T[K]["stride"] extends Stride<"fixed"> ? true : false }[keyof T] extends true
		? [Extract<keyof T, `${string}?`>] extends [never] ? Stride<"fixed"> : Stride<"variable">
		: Stride<"variable">;

	/** The original shape passed to the constructor. */
	public readonly shape: T;

	private readonly keys: Extract<keyof T, string>[];
	private readonly factory: ((...args: unknown[]) => ModelOutput<T>) | null;
	private readonly optionalFactories:
		| Map<bigint, (...args: unknown[]) => ModelOutput<T>>
		| null;
	private readonly requiredKeys: Extract<keyof T, string>[];
	private readonly optionalKeys: Extract<keyof T, string>[];
	private readonly optionalBits: bigint[];
	private readonly args: unknown[];
	private readonly reqArgs: unknown[];
	private readonly optArgs: unknown[];

	constructor(shape: T) {
		super();
		this.shape = shape;
		this.keys = Object.keys(shape) as typeof this.keys;

		this.requiredKeys = this.keys.filter((k) => !k.endsWith("?"));
		this.optionalKeys = this.keys.filter((k) => k.endsWith("?"));

		const hasOptional = this.optionalKeys.length > 0;
		this.args = new Array(this.keys.length);
		this.reqArgs = new Array(this.requiredKeys.length);
		this.optArgs = new Array(this.optionalKeys.length);
		if (hasOptional) {
			this.factory = null;
			this.optionalFactories = new Map();
		} else {
			const keys = this.keys;
			const params = keys.map((_, i) => `arg${i}`);
			const body = `return { ${keys.map((k, i) => `${JSON.stringify(k)}: arg${i}`).join(", ")} };`;
			this.factory = new Function(...params, body) as typeof this.factory;
			this.optionalFactories = null;
		}

		let optIdx = 0n;
		this.optionalBits = this.keys.map((k) => k.endsWith("?") ? 1n << optIdx++ : 0n);

		let size = 0;
		let variable = hasOptional;
		if (!variable) {
			for (const key of this.keys) {
				const s = shape[key]!.stride;
				if (s.kind === "variable") {
					variable = true;
					break;
				}
				size += s.size;
			}
		}
		this.stride = (variable ? { kind: "variable" } : { kind: "fixed", size }) as typeof this.stride;
	}

	/**
	 * Encodes a model value into bytes.
	 *
	 * Each required field is encoded in declaration order. Each optional field
	 * is prefixed with a presence byte (`0x01` present / `0x00` absent).
	 *
	 * @param value - The object to encode. Required fields must be present;
	 *   optional fields may be omitted (`undefined`).
	 * @param target - Omit (along with `offset`) to allocate and return a new
	 *   buffer. Pass a buffer large enough to hold the result to write in place.
	 * @param offset - Byte position within `target` to write at. Required together with `target`.
	 * @returns A new `Uint8Array` when `target` is omitted, otherwise the number of bytes written.
	 *
	 * @example
	 * const bytes = codec.encode({ id: 1, name: "Alice" });
	 */
	public encoder(value: ModelInput<T>, target: undefined, offset: undefined): Uint8Array<ArrayBuffer>;
	public encoder(value: ModelInput<T>, target: Uint8Array, offset: number): number;
	public encoder(value: ModelInput<T>, target?: Uint8Array, offset?: number): Uint8Array<ArrayBuffer> | number {
		if (target !== undefined) {
			let size = 0;
			for (let i = 0; i < this.keys.length; i++) {
				const rawKey = this.keys[i]!;
				const codec = this.shape[rawKey]!;
				if (rawKey.endsWith("?")) {
					const fieldValue = value[rawKey.slice(0, -1) as keyof typeof value];
					if (fieldValue === undefined) {
						target[offset! + size] = 0x00;
						size += 1;
					} else {
						target[offset! + size] = 0x01;
						size += 1;
						size += codec.encodeInto(fieldValue, target, offset! + size);
					}
				} else {
					size += codec.encodeInto(value[rawKey as never], target, offset! + size);
				}
			}
			return size;
		}

		if (this.stride.kind === "fixed") {
			const result = new Uint8Array(this.stride.size);
			this.encodeInto(value, result);
			return result;
		}
		const parts: Uint8Array[] = [];
		for (let i = 0; i < this.keys.length; i++) {
			const rawKey = this.keys[i]!;
			const codec = this.shape[rawKey]!;
			if (rawKey.endsWith("?")) {
				const fieldValue = value[rawKey.slice(0, -1) as keyof typeof value];
				if (fieldValue === undefined) {
					parts.push(new Uint8Array([0x00]));
				} else {
					const encoded = codec.encode(fieldValue);
					const presenced = new Uint8Array(1 + encoded.length);
					presenced[0] = 0x01;
					presenced.set(encoded, 1);
					parts.push(presenced);
				}
			} else {
				parts.push(codec.encode(value[rawKey as never]));
			}
		}
		const totalLen = parts.reduce((sum, p) => sum + p.length, 0);
		const result = new Uint8Array(totalLen);
		let off = 0;
		for (const part of parts) {
			result.set(part, off);
			off += part.length;
		}
		return result;
	}

	/**
	 * Decodes bytes into a model output object.
	 *
	 * Fields are decoded in declaration order. For each optional field a
	 * presence byte is consumed first; if `0x00` the field is omitted from the
	 * result object.
	 *
	 * @param data - The byte array to decode from.
	 * @param offset - Byte position to begin reading from.
	 * @returns A tuple of `[decoded object, bytes consumed]`.
	 *
	 * @throws {Error} If an internal factory construction fails (should not
	 *   occur under normal use).
	 *
	 * @example
	 * const [person, bytesRead] = codec.decode(bytes);
	 */
	public decoder(data: Uint8Array, offset: number): [ModelOutput<T>, number] {
		let currentOffset = offset;

		if (this.factory !== null) {
			const args = this.args;
			for (let i = 0; i < this.keys.length; i++) {
				const codec = this.shape[this.keys[i]!];
				const [fieldValue, size] = codec.decode(data, currentOffset);
				args[i] = fieldValue;
				currentOffset += size;
			}
			return [this.factory(...args), currentOffset - offset];
		}

		const reqArgs = this.reqArgs;
		const optArgs = this.optArgs;
		let optLen = 0;
		let mask = 0n;
		let reqIdx = 0;

		for (let i = 0; i < this.keys.length; i++) {
			const rawKey = this.keys[i]!;
			const codec = this.shape[rawKey]!;

			if (rawKey.endsWith("?")) {
				const presenceByte = data[currentOffset]!;
				currentOffset += 1;

				if (presenceByte !== 0x00) {
					const [fieldValue, size] = codec.decode(data, currentOffset);
					optArgs[optLen++] = fieldValue;
					mask |= this.optionalBits[i]!;
					currentOffset += size;
				}
			} else {
				const [fieldValue, size] = codec.decode(data, currentOffset);
				reqArgs[reqIdx] = fieldValue;
				reqIdx++;
				currentOffset += size;
			}
		}

		let factory = this.optionalFactories!.get(mask);
		if (factory === undefined) {
			const allKeys: string[] = [];
			for (const k of this.requiredKeys) allKeys.push(k);
			const optLen = this.optionalKeys.length;
			for (let i = 0; i < optLen; i++) {
				if (mask & (1n << BigInt(i))) {
					allKeys.push(this.optionalKeys[i]!.slice(0, -1));
				}
			}
			const params = allKeys.map((_, i) => `arg${i}`);
			const body = `return { ${allKeys.map((k, i) => `${JSON.stringify(k)}: arg${i}`).join(", ")} };`;
			factory = new Function(...params, body) as (
				...args: unknown[]
			) => ModelOutput<T>;
			this.optionalFactories!.set(mask, factory);
		}

		return [factory(...reqArgs, ...optArgs.slice(0, optLen)), currentOffset - offset];
	}

	/**
	 * Returns a new {@link ModelCodec} where every field in the original shape
	 * is made optional (presence-prefixed). Fields that were already optional
	 * remain optional.
	 *
	 * Useful for update / patch operations where only a subset of fields need to
	 * be provided.
	 *
	 * @returns A `ModelCodec` whose shape is {@link PartialShape}`<T>`.
	 *
	 * @example
	 * const PatchCodec = PersonCodec.partial();
	 * const bytes = PatchCodec.encode({ name: "Bob" }); // age omitted
	 */
	public partial(): ModelCodec<PartialShape<T>> {
		const partialShape: { [key: string]: Codec } = {};
		for (const rawKey of this.keys) {
			const optKey = rawKey.endsWith("?") ? rawKey : `${rawKey}?`;
			partialShape[optKey] = this.shape[rawKey]!;
		}
		return new ModelCodec(partialShape) as never;
	}
}
