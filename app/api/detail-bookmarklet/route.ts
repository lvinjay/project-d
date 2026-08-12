import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProductRow = {
  id: string;
  product_name: string;
  source_url: string;
};

function createBookmarklet(
  productId: string,
  capturePageUrl: string,
) {
  const encodedProductId =
    JSON.stringify(productId);
  const encodedCapturePageUrl =
    JSON.stringify(capturePageUrl);

  const script = `
(async()=>{
  const projectTab=window.open("about:blank","_blank");

  if(!projectTab){
    alert("Project D 새 탭이 차단되었습니다. 현재 상품 사이트의 팝업을 허용해 주세요.");
    return;
  }

  try{
    projectTab.document.write(
      "<title>Project D 상세정보 수집</title>"+
      "<div style='font-family:sans-serif;padding:40px'>"+
      "<h2>상품 상세정보를 수집하고 있습니다.</h2>"+
      "<p>현재 상품페이지에서 확인 가능한 스펙과 설명을 정리하는 중입니다.</p>"+
      "</div>"
    );

    const clean=(value,max=10000)=>
      typeof value==="string"
        ? value.replace(/\\\\s+/g," ").trim().slice(0,max)
        : "";

    const meta=(selector)=>
      clean(
        document.querySelector(selector)?.getAttribute("content")||"",
        4000
      );

    const jsonLd=[...document.querySelectorAll('script[type="application/ld+json"]')]
      .map(node=>clean(node.textContent||"",12000))
      .filter(Boolean)
      .slice(0,8);

    const headings=[...document.querySelectorAll("h1,h2,h3,h4")]
      .map(node=>clean(node.textContent||"",500))
      .filter(Boolean)
      .slice(0,120);

    const tables=[...document.querySelectorAll("table")]
      .map(node=>clean(node.innerText||node.textContent||"",4000))
      .filter(Boolean)
      .slice(0,30);

    const definitionLists=[...document.querySelectorAll("dl")]
      .map(node=>clean(node.innerText||node.textContent||"",2500))
      .filter(Boolean)
      .slice(0,40);

    const imageTexts=[...document.images]
      .flatMap(img=>[
        clean(img.alt||"",700),
        clean(img.title||"",700)
      ])
      .filter(Boolean)
      .slice(0,250);

    const imageCandidates=[...document.images]
      .map((img,index)=>{
        const src=
          img.currentSrc||
          img.src||
          img.getAttribute("data-src")||
          img.getAttribute("data-original")||
          "";

        const rect=img.getBoundingClientRect();

        return {
          index,
          src:clean(src,5000),
          alt:clean(img.alt||"",700),
          title:clean(img.title||"",700),
          width:Number(img.naturalWidth||img.width||Math.round(rect.width)||0),
          height:Number(img.naturalHeight||img.height||Math.round(rect.height)||0)
        };
      })
      .filter(item=>
        item.src &&
        item.width>=300 &&
        item.height>=200
      )
      .slice(0,80);

    const buttonAndLabels=[...document.querySelectorAll(
      "button,[role='button'],label,strong,b"
    )]
      .map(node=>clean(node.textContent||"",500))
      .filter(Boolean)
      .slice(0,250);

    const visibleText=clean(
      document.body?.innerText||"",
      65000
    );

    const snapshot={
      pageUrl:window.location.href,
      cleanSourceUrl:window.location.origin+window.location.pathname,
      hostname:window.location.hostname,
      title:clean(document.title,1500),
      meta:{
        description:meta('meta[name="description"]'),
        ogTitle:meta('meta[property="og:title"]'),
        ogDescription:meta('meta[property="og:description"]'),
        ogImage:meta('meta[property="og:image"]'),
        ogPrice:meta('meta[property="product:price:amount"]'),
        ogCurrency:meta('meta[property="product:price:currency"]')
      },
      jsonLd,
      headings,
      tables,
      definitionLists,
      imageTexts,
      imageCandidates,
      buttonAndLabels,
      visibleText,
      capturedAt:new Date().toISOString()
    };

    projectTab.name=JSON.stringify({
      type:"PROJECT_D_PRODUCT_DETAIL",
      productId:${encodedProductId},
      snapshot
    });

    projectTab.location.replace(
      ${encodedCapturePageUrl}
    );

    alert(
      "Project D\\\\n상품 상세정보를 브라우저에서 수집했습니다.\\\\n새 탭에서 AI 분석과 저장을 진행합니다."
    );
  }catch(error){
    if(projectTab&&!projectTab.closed){
      projectTab.close();
    }

    alert(
      "상세정보 수집 실패: "+
      (error instanceof Error?error.message:String(error))
    );
  }
})()
`;

  return `javascript:${script
    .replace(/\n/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()}`;
}

export async function GET(request: Request) {
  try {
    const requestUrl =
      new URL(request.url);

    const productId =
      requestUrl.searchParams
        .get("productId")
        ?.trim() ?? "";

    if (!productId) {
      return NextResponse.json(
        {
          success: false,
          message: "productId가 필요합니다.",
        },
        { status: 400 },
      );
    }

    const { data, error } =
      await supabase
        .from("products")
        .select(
          "id, product_name, source_url",
        )
        .eq("id", productId)
        .single();

    if (error) {
      throw error;
    }

    const product =
      data as ProductRow;

    const capturePageUrl =
      `${requestUrl.origin}/admin/detail-capture` +
      `?productId=${encodeURIComponent(
        product.id,
      )}`;

    return NextResponse.json({
      success: true,
      bookmarkletName:
        `Project D 상세 - ${product.product_name}`,
      bookmarklet: createBookmarklet(
        product.id,
        capturePageUrl,
      ),
    });
  } catch (error) {
    console.error(
      "Detail bookmarklet API error:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "상세정보 수집 코드를 생성하지 못했습니다.",
      },
      { status: 500 },
    );
  }
}


