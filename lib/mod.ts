/**
 * @module codec
 *
 * Public entry point for the `@nomadshiba/codec` library.
 *
 * Re-exports every codec primitive, utility type, and composite builder
 * available in the library. Import from this module for a single, stable
 * surface area:
 *
 * ```ts
 * import { U32, Utf8, Struct, VarInt } from "@nomadshiba/codec";
 * ```
 *
 * Grouped exports:
 *
 * - **Base** (`./codec`) — {@link Codec}, {@link CodecWithOffsets},
 *   {@link TransformCodec}, {@link Stride}, {@link FixedCodec},
 *   {@link VariableCodec}, and the `Codec` utility namespace.
 *
 * - **VarInt** (`./varint`) — {@link VarIntCodec} and the {@link VarInt}
 *   singleton. LEB128 encoding for non-negative integers.
 *
 * - **Primitives** (`./primitives`) — Fixed-width numeric and boolean codecs
 *   ({@link U8}, {@link I8}, {@link U16}, {@link I16}, {@link U32},
 *   {@link I32}, {@link U64}, {@link I64}, {@link F32}, {@link F64},
 *   {@link Bool}, {@link Void}) plus little-endian singletons
 *   (`U16LE`, `I16LE`, …). Big-endian by default.
 *
 * - **Bytes & Strings** (`./bytes/mod`) — Codecs for raw byte buffers and
 *   UTF-8 strings.
 *
 * - **Composites** (`./composites/mod`) — Higher-order codec builders:
 *   nullable, tuple, array, enum, padded enum, mapping, struct, and model.
 */

// Base codec class
export * from "./codec.ts";

// VarInt (LEB128 encoding for non-negative integers)
export * from "./varint.ts";

// Primitives (big-endian default, little-endian variants available)
export * from "./primitives.ts";

// Bytes & Strings
export * from "./bytes/mod.ts";

// Composites
export * from "./composites/mod.ts";
