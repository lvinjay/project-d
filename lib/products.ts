import rawProducts from "../data/products.json";
import type { Product } from "./types";

export const products = rawProducts as Product[];

export function getProductsByIds(ids: number[]) {
  if (ids.length === 0) return products;
  return products.filter((product) => ids.includes(product.id));
}
