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
  reviewPageUrl: string,
) {
  const encodedProductId = JSON.stringify(productId);
  const encodedReviewPageUrl = JSON.stringify(reviewPageUrl);

  const script = `
(async()=>{
  const projectTab=window.open("about:blank","_blank");

  if(!projectTab){
    alert("Project D 새 탭이 차단되었습니다. 현재 네이버 사이트의 팝업을 허용해 주세요.");
    return;
  }

  const originalFetch=window.fetch;
  const originalXhrOpen=XMLHttpRequest.prototype.open;
  const originalXhrSend=XMLHttpRequest.prototype.send;
  const xhrUrls=new WeakMap();
  let overlay=null;
  let restored=false;

  const restore=()=>{
    if(restored){return;}
    restored=true;
    window.fetch=originalFetch;
    XMLHttpRequest.prototype.open=originalXhrOpen;
    XMLHttpRequest.prototype.send=originalXhrSend;
    if(overlay&&overlay.remove){overlay.remove();}
  };

  const parseBody=(body)=>{
    if(!body){return null;}
    try{
      if(typeof body==="string"){
        return JSON.parse(body);
      }
      if(body instanceof URLSearchParams){
        return Object.fromEntries(body.entries());
      }
    }catch{}
    return null;
  };

  const isReviewUrl=(value)=>
    typeof value==="string"&&
    value.includes("/contents/reviews/query-pages");

  try{
    projectTab.document.write(
      "<title>Project D 준비 중</title>"+
      "<div style='font-family:sans-serif;padding:40px'>"+
      "<h2>네이버 리뷰 요청을 기다리고 있습니다.</h2>"+
      "<p>상품페이지에서 리뷰를 조금 더 내리거나 정렬을 한 번 바꿔 주세요.</p>"+
      "<p>실제 요청을 확인하면 자동으로 분석을 시작합니다.</p>"+
      "</div>"
    );

    const hostname=window.location.hostname;
    const reviewApi=
      hostname==="smartstore.naver.com"
        ? "/i/v1/contents/reviews/query-pages"
        : hostname==="brand.naver.com"
          ? "/n/v1/contents/reviews/query-pages"
          : null;

    if(!reviewApi){
      throw new Error("네이버 브랜드스토어 또는 스마트스토어 상품페이지에서 실행해 주세요.");
    }

    overlay=document.createElement("div");
    overlay.style.cssText=[
      "position:fixed",
      "z-index:2147483647",
      "left:20px",
      "right:20px",
      "bottom:20px",
      "padding:18px 20px",
      "border-radius:14px",
      "background:#111827",
      "color:#fff",
      "font-family:Arial,sans-serif",
      "font-size:15px",
      "line-height:1.6",
      "box-shadow:0 10px 30px rgba(0,0,0,.3)"
    ].join(";");
    overlay.innerHTML=
      "<strong style='font-size:17px'>Project D가 리뷰 요청을 기다리는 중입니다.</strong>"+
      "<div style='margin-top:6px'>리뷰 영역을 조금 더 내리거나, 최신순·평점순 등 정렬을 한 번 바꿔 주세요.</div>"+
      "<div style='margin-top:4px;color:#cbd5e1'>최대 90초 동안 기다립니다.</div>";
    document.body.appendChild(overlay);

    const captured=await new Promise((resolve,reject)=>{
      let settled=false;

      const finish=(body)=>{
        if(settled){return;}
        const parsed=parseBody(body);
        const merchant=Number(parsed&&parsed.checkoutMerchantNo);
        const product=Number(parsed&&parsed.originProductNo);

        if(
          Number.isSafeInteger(merchant)&&merchant>0&&
          Number.isSafeInteger(product)&&product>0
        ){
          settled=true;
          restore();
          resolve({
            checkoutMerchantNo:merchant,
            originProductNo:product
          });
        }
      };

      window.fetch=async function(input,init){
        const url=
          typeof input==="string"
            ? input
            : input&&typeof input.url==="string"
              ? input.url
              : "";

        if(isReviewUrl(url)){
          finish(init&&init.body);
        }

        return originalFetch.apply(this,arguments);
      };

      XMLHttpRequest.prototype.open=function(method,url){
        xhrUrls.set(this,String(url));
        return originalXhrOpen.apply(this,arguments);
      };

      XMLHttpRequest.prototype.send=function(body){
        const url=xhrUrls.get(this)||"";
        if(isReviewUrl(url)){
          finish(body);
        }
        return originalXhrSend.apply(this,arguments);
      };

      setTimeout(()=>{
        if(settled){return;}
        settled=true;
        restore();
        reject(new Error("90초 동안 새 리뷰 요청을 감지하지 못했습니다. 북마크를 다시 누른 뒤 리뷰 정렬을 바꾸거나 더 아래로 내려 주세요."));
      },90000);
    });

    const checkoutMerchantNo=captured.checkoutMerchantNo;
    const originProductNo=captured.originProductNo;

    if(projectTab&&!projectTab.closed){
      projectTab.document.body.innerHTML=
        "<div style='font-family:sans-serif;padding:40px'>"+
        "<h2>정확한 리뷰 정보를 확인했습니다.</h2>"+
        "<p>추천순·최신순·평점 낮은순을 섞어 최대 200개의 리뷰를 수집하고 있습니다.</p>"+
        "</div>";
    }

    const requestReviews=async(page,sortType)=>{
      const response=await originalFetch(reviewApi,{
        method:"POST",
        headers:{
          accept:"application/json, text/plain, */*",
          "content-type":"application/json"
        },
        credentials:"include",
        body:JSON.stringify({
          checkoutMerchantNo,
          originProductNo,
          page,
          pageSize:20,
          reviewSearchSortType:sortType
        })
      });

      if(response.status===204){return null;}
      if(!response.ok){
        throw new Error(
          "리뷰 "+page+"페이지 요청 실패("+sortType+"): HTTP "+response.status
        );
      }

      const contentType=response.headers.get("content-type")||"";
      if(!contentType.includes("application/json")){
        throw new Error("리뷰 API가 JSON이 아닌 형식으로 응답했습니다.");
      }

      const data=await response.json();
      return Array.isArray(data.contents)?data.contents:[];
    };

    const reviews=[];
    const seen=new Set();

    const addReviews=async(sortType,targetCount,maxPages)=>{
      let added=0;

      for(let page=1;page<=maxPages;page+=1){
        const contents=await requestReviews(page,sortType);
        if(!contents){break;}

        for(const review of contents){
          const reviewText=
            typeof review.reviewContent==="string"
              ? review.reviewContent.replace(/\\s+/g," ").trim()
              : "";

          if(reviewText&&!seen.has(reviewText)){
            seen.add(reviewText);
            reviews.push(reviewText);
            added+=1;
          }

          if(added>=targetCount||reviews.length>=200){break;}
        }

        if(
          added>=targetCount||
          reviews.length>=200||
          contents.length<20
        ){break;}

        await new Promise(resolve=>setTimeout(resolve,500));
      }

      return added;
    };

    const collectionStats={
      ranking:0,
      latest:0,
      lowScore:0,
      total:0
    };

    collectionStats.ranking+=await addReviews("REVIEW_RANKING",100,8);

    if(reviews.length<200){
      collectionStats.latest+=await addReviews("REVIEW_CREATE_DATE_DESC",50,6);
    }

    if(reviews.length<200){
      collectionStats.lowScore+=await addReviews("REVIEW_SCORE_ASC",50,6);
    }

    if(reviews.length<200){
      collectionStats.ranking+=await addReviews(
        "REVIEW_RANKING",
        200-reviews.length,
        10
      );
    }

    if(reviews.length<200){
      collectionStats.latest+=await addReviews(
        "REVIEW_CREATE_DATE_DESC",
        200-reviews.length,
        10
      );
    }

    const result=reviews.slice(0,200);
    collectionStats.total=result.length;
    if(result.length===0){
      throw new Error("수집된 리뷰가 없습니다.");
    }

    const cleanSourceUrl=window.location.origin+window.location.pathname;

    projectTab.name=JSON.stringify({
      type:"PROJECT_D_NAVER_REVIEWS",
      productId:${encodedProductId},
      sourceUrl:cleanSourceUrl,
      checkoutMerchantNo,
      originProductNo,
      collectionStats,
      reviews:result
    });

    projectTab.location.replace(${encodedReviewPageUrl});

    alert(
      "Project D\\n정확한 판매자 번호와 원상품 번호를 자동으로 확인했습니다.\\n"+
      "리뷰 "+result.length+"개를 수집했습니다.\\n"+
      "(추천순 "+collectionStats.ranking+
      " · 최신순 "+collectionStats.latest+
      " · 낮은평점순 "+collectionStats.lowScore+")\\n"+
      "분석과 저장이 자동으로 진행됩니다."
    );
  }catch(error){
    restore();
    if(projectTab&&!projectTab.closed){projectTab.close();}
    alert(
      "상품 정보 또는 리뷰 수집 실패: "+
      (error instanceof Error?error.message:String(error))
    );
  }
})();
`;

  return `javascript:${script
    .replace(/\n/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()}`;
}

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const productId =
      requestUrl.searchParams.get("productId")?.trim() ?? "";

    if (!productId) {
      return NextResponse.json(
        { success: false, message: "productId가 필요합니다." },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("products")
      .select("id, product_name, source_url")
      .eq("id", productId)
      .single();

    if (error) throw error;

    const product = data as ProductRow;
    const reviewPageUrl =
      `${requestUrl.origin}/admin/review` +
      `?id=${encodeURIComponent(product.id)}`;

    return NextResponse.json({
      success: true,
      product: {
        id: product.id,
        productName: product.product_name,
        sourceUrl: product.source_url,
      },
      reviewPageUrl,
      bookmarkletName: `Project D - ${product.product_name}`,
      bookmarklet: createBookmarklet(product.id, reviewPageUrl),
    });
  } catch (error) {
    console.error("Review bookmarklet API error:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "북마크 코드를 생성하지 못했습니다.",
      },
      { status: 500 },
    );
  }
}
