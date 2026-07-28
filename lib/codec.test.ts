import { assertEquals } from "@std/assert";
import { TransformCodec } from "~/codec.ts";
import { U8, Void } from "~/primitives.ts";

// ── VoidCodec / Void ──────────────────────────────────────────────────────────

Deno.test("Void - stride is fixed 0 bytes", () => {
	assertEquals(Void.stride, { kind: "fixed", size: 0 });
});

Deno.test("Void - encode produces 0 bytes", () => {
	assertEquals(Void.encode(undefined).byteLength, 0);
	assertEquals(Void.encode(null).byteLength, 0);
	assertEquals(Void.encode(void 0).byteLength, 0);
});

Deno.test("Void - encodeInto returns 0 and leaves target unchanged", () => {
	const target = new Uint8Array(4);
	const written = Void.encodeInto(undefined, target);
	assertEquals(written, 0);
	assertEquals(target, new Uint8Array(4));
});

Deno.test("Void - decode consumes 0 bytes", () => {
	const [value, bytesRead] = Void.decode(new Uint8Array([1, 2, 3]));
	assertEquals(value, undefined);
	assertEquals(bytesRead, 0);
});

Deno.test("Void - decode on empty buffer", () => {
	const [value, bytesRead] = Void.decode(new Uint8Array(0));
	assertEquals(value, undefined);
	assertEquals(bytesRead, 0);
});

Deno.test("Void - roundtrip", () => {
	const [decoded, bytesRead] = Void.decode(Void.encode(undefined));
	assertEquals(decoded, undefined);
	assertEquals(bytesRead, 0);
});

// ── TransformCodec / Codec.transform() ───────────────────────────────────────

Deno.test("TransformCodec - stride inherited from inner codec", () => {
	const Clamped = U8.transform((n) => Math.min(n, 100));
	assertEquals(Clamped.stride, U8.stride);
	assertEquals(Clamped.stride, { kind: "fixed", size: 1 });
});

Deno.test("TransformCodec - decode applies transformer", () => {
	const Clamped = U8.transform((n) => Math.min(n, 100));
	const [value, bytesRead] = Clamped.decode(new Uint8Array([200]));
	assertEquals(value, 100);
	assertEquals(bytesRead, 1);
});

Deno.test("TransformCodec - decode passthrough when under cap", () => {
	const Clamped = U8.transform((n) => Math.min(n, 100));
	const [value] = Clamped.decode(new Uint8Array([42]));
	assertEquals(value, 42);
});

Deno.test("TransformCodec - encode delegates to inner codec unchanged", () => {
	const Doubled = U8.transform((n) => n * 2);
	const encoded = Doubled.encode(42);
	assertEquals(Array.from(encoded), [42]);
});

Deno.test("TransformCodec - transformer receives raw bytes", () => {
	let capturedBytes: Uint8Array | null = null;
	const Spy = U8.transform((n, bytes) => {
		capturedBytes = bytes;
		return n;
	});
	Spy.decode(new Uint8Array([0xab, 0xff]));
	assertEquals(capturedBytes, new Uint8Array([0xab]));
});

Deno.test("TransformCodec - roundtrip via numeric transform", () => {
	// encode(50) → [50]; decode([50]) → 50 * 2 = 100
	const Doubled = U8.transform((n) => n * 2);
	const encoded = Doubled.encode(50);
	const [decoded] = Doubled.decode(encoded);
	assertEquals(decoded, 100);
});

Deno.test("TransformCodec - inner property set correctly", () => {
	const T = U8.transform((n) => n * 2);
	assertEquals(T.inner, U8);
});

Deno.test("TransformCodec - constructed directly via new", () => {
	const T = new TransformCodec(U8, (n: number) => n + 1);
	const [value] = T.decode(new Uint8Array([9]));
	assertEquals(value, 10);
	assertEquals(T.stride, { kind: "fixed", size: 1 });
});
