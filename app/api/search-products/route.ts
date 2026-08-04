import { NextResponse } from "next/server";
import { products } from "../../../lib/products";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const query = (searchParams.get("q") ?? "").toLowerCase().trim();

  const result = products.filter((product) => {
    if (!query) return true;

    return (
      product.name.toLowerCase().includes(query) ||
      product.brand.toLowerCase().includes(query) ||
      product.category.toLowerCase().includes(query)
    );
  });

  return NextResponse.json(result);
}