import { describe, expectTypeOf, it } from "vitest";
import type {
  FrontmatterDate,
  FrontmatterLink,
  FrontmatterValue,
  getFrontmatter,
  PropertyType,
  PropertyTypes,
} from "../src/index.js";

type Returned = ReturnType<typeof getFrontmatter>[string];

describe("Frontmatter value types", () => {
  it("getFrontmatter returns exactly the exported value types", () => {
    expectTypeOf<Returned>().toEqualTypeOf<FrontmatterValue>();
  });

  it("a Frontmatter value can be a link or a date", () => {
    expectTypeOf<FrontmatterLink>().toExtend<FrontmatterValue>();
    expectTypeOf<FrontmatterDate>().toExtend<FrontmatterValue>();
  });

  it("a link without a url is marked unresolved", () => {
    expectTypeOf<{ label: string }>().not.toExtend<FrontmatterLink>();
    expectTypeOf<{
      label: string;
      unresolved: true;
    }>().toExtend<FrontmatterLink>();
  });

  it("a date value carries its kind", () => {
    expectTypeOf<FrontmatterDate["kind"]>().toEqualTypeOf<
      "date" | "datetime"
    >();
  });

  it("PropertyTypes maps property names to a PropertyType", () => {
    expectTypeOf<PropertyTypes>().toEqualTypeOf<Record<string, PropertyType>>();
    expectTypeOf<"date">().toExtend<PropertyType>();
    expectTypeOf<"datetime">().toExtend<PropertyType>();
  });
});
