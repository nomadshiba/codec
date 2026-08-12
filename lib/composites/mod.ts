/**
 * Composite codecs for encoding/decoding structured data.
 *
 * Re-exports all composite codec classes, types, and helpers:
 *
 * - {@link NullableCodec} — optional (nullable) wrapper around any codec
 * - {@link TupleCodec} — fixed-length heterogeneous sequence
 * - {@link ArrayCodec} — variable-length homogeneous sequence
 * - {@link EnumCodec} — tagged union / discriminated enum (variable-size variants)
 * - {@link PaddedEnumCodec} — tagged union with fixed-size padded variants
 * - {@link StructCodec} — named-field struct (all fields required)
 * - {@link ModelCodec} — named-field struct with per-field optionality
 *
 * @module
 */
export * from "./nullable.ts";
export * from "./tuple.ts";
export * from "./array.ts";
export * from "./enum.ts";
export * from "./padded_enum.ts";
export * from "./struct.ts";
export * from "./model.ts";
