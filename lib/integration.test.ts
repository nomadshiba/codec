import { assertEquals } from "@std/assert";
import { ArrayCodec } from "~/composites/array.ts";
import { EnumCodec } from "~/composites/enum.ts";
import { ModelCodec } from "~/composites/model.ts";
import { NullableCodec } from "~/composites/nullable.ts";
import { StringCodec } from "~/bytes/string.ts";
import { Bool, I32, U32, U8 } from "~/primitives.ts";

Deno.test("Complex - nested structures", () => {
	const Address = new ModelCodec({
		street: new StringCodec(),
		city: new StringCodec(),
		zipCode: U32,
	});

	const Person = new ModelCodec({
		id: U32,
		name: new StringCodec(),
		age: U8,
		address: Address,
		tags: new ArrayCodec(new StringCodec()),
	});

	const val = {
		id: 123,
		name: "Alice",
		age: 30,
		address: { street: "123 Main St", city: "Springfield", zipCode: 12345 },
		tags: ["developer", "rust", "typescript"],
	};

	const [decoded] = Person.decode(Person.encode(val));
	assertEquals(decoded, val);
});

Deno.test("Complex - nullable nested structures", () => {
	const Config = new ModelCodec({
		enabled: Bool,
		timeout: new NullableCodec(U32),
		endpoints: new ArrayCodec(new StringCodec()),
	});

	const val1 = {
		enabled: true,
		timeout: 5000,
		endpoints: ["http://localhost:8080", "http://api.example.com"],
	};
	const [decoded1] = Config.decode(Config.encode(val1));
	assertEquals(decoded1, val1);

	const val2 = { enabled: false, timeout: null, endpoints: [] };
	const [decoded2] = Config.decode(Config.encode(val2));
	assertEquals(decoded2, val2);
});

Deno.test("Complex - array of unions", () => {
	const Message = new EnumCodec({
		Text: new StringCodec(),
		Number: I32,
		Flag: Bool,
	});

	const Messages = new ArrayCodec(Message);

	const val = [
		{ kind: "Text", value: "hello" } as const,
		{ kind: "Number", value: 42 } as const,
		{ kind: "Flag", value: true } as const,
	];

	const [decoded] = Messages.decode(Messages.encode(val));
	assertEquals(decoded, val);
});

Deno.test("Complex - struct with optional fields in real schema", () => {
	const UserProfile = new ModelCodec({
		id: U32,
		username: new StringCodec(),
		"bio?": new StringCodec(),
		"avatarUrl?": new StringCodec(),
		"age?": U8,
	});

	const minimal = { id: 1, username: "ada" };
	const [d1] = UserProfile.decode(UserProfile.encode(minimal));
	assertEquals(d1, minimal);

	const full = {
		id: 2,
		username: "bob",
		bio: "Hello world",
		avatarUrl: "https://example.com/avatar.png",
		age: 28,
	};
	const [d2] = UserProfile.decode(UserProfile.encode(full));
	assertEquals(d2, full);

	const partial = { id: 3, username: "carol", age: 35 };
	const [d3] = UserProfile.decode(UserProfile.encode(partial));
	assertEquals(d3, partial);
});
