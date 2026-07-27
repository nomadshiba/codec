/**
 * Structural shape for anything byte-array-like that a codec can read from or
 * write into — general indexed byte access plus `subarray`/`set`/`fill`,
 * without requiring a real `ArrayBuffer` backing (e.g. `buffer`/`byteOffset`
 * are not required). A real `Uint8Array` satisfies this already.
 */
export interface Uint8ArrayLike {
	readonly length: number;
	[index: number]: number;
	subarray(start?: number, end?: number): Uint8ArrayLike;
	slice(start?: number, end?: number): Uint8Array<ArrayBuffer>;
	set(array: ArrayLike<number>, offset?: number): void;
	fill(value: number, start?: number, end?: number): unknown;
}
