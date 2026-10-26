import {describe,it,expect,vi} from "vitest";
import {submissionCategory,suggestedSubmissionCategory,submissionImageSize,submissionMedia} from "../../supabase/functions/_shared/submissionImport";
const png=(width:number,height:number)=>{const bytes=new Uint8Array(24);bytes.set([137,80,78,71]);const view=new DataView(bytes.buffer);view.setUint32(16,width);view.setUint32(20,height);return bytes;};
describe("submission import media and taxonomy",()=>{
  it("maps a social card to the hero and chooses the largest real square icon",async()=>{
    const sizes:Record<string,Uint8Array>={"/social.png":png(1200,630),"/tiny.png":png(32,32),"/apple.png":png(180,180),"/icon.png":png(512,512)};
    const media=await submissionMedia("https://example.com","https://example.com/social.png",["https://example.com/tiny.png","https://example.com/apple.png","https://example.com/icon.png"],async url=>({url,bytes:sizes[new URL(url).pathname]}));
    expect(media).toEqual({hero_url:"https://example.com/social.png",logo_url:"https://example.com/icon.png"});
  });
  it("never uses social artwork or a tiny/unsupported favicon as the app icon",async()=>{
    const media=await submissionMedia("https://example.com","https://example.com/social.png",["https://example.com/favicon.ico"],async url=>({url,bytes:url.endsWith("ico")?new Uint8Array([0,0,1,0]):png(1200,630)}));
    expect(media.logo_url).toBeNull();expect(media.hero_url).toBe("https://example.com/social.png");
    expect(submissionImageSize(png(10000,10000))).toBeNull();
  });
  it("rejects external/unsafe/redirected images and tolerates missing images",async()=>{
    const fetch=vi.fn(async(url:string)=>{if(url.endsWith("missing.png"))throw new Error("404");return {url:"https://other.example.com/icon.png",bytes:png(512,512)};});
    const result=await submissionMedia("https://example.com",null,["http://example.com/icon.png","https://evil.com/icon.png","https://example.com/redirect.png","https://example.com/missing.png"],fetch);
    expect(fetch).toHaveBeenCalledTimes(2);expect(result).toEqual({logo_url:null,hero_url:null});
  });
  it("accepts known categories and aliases, never invents a category",()=>{
    expect(suggestedSubmissionCategory("website","Rocket","Discover apps. Grow your own.")).toBe("Platforms");
    expect(suggestedSubmissionCategory("github","next.js","A React framework")).toBe("Engineering & Development");
    expect(suggestedSubmissionCategory("website","Mystery","Hello there")).toBeNull();
    expect(submissionCategory("Developer Tools")).toBe("Engineering & Development");
    expect(submissionCategory("productivity")).toBe("Productivity");
    expect(submissionCategory("Unknown business stuff")).toBeNull();
  });
});
