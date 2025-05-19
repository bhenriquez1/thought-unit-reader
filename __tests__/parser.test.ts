import { improveBiomedicalParsing } from "../lib/parser";

test("parser highlights biomedical terms", () => {
  const input = "The enzyme-substrate complex is key in signal transduction.";
  const output = improveBiomedicalParsing(input);
  expect(output).toMatch(/enzyme-substrate complex/);
  expect(output).toMatch(/signal transduction/);
});