import { redirect } from "next/navigation";

interface PageProps {
  searchParams?: { [key: string]: string | string[] | undefined };
}

export default function Home({ searchParams }: PageProps) {
  const shop = searchParams?.shop;
  const hmac = searchParams?.hmac;

  if (shop && hmac) {
    const params = new URLSearchParams();
    if (searchParams) {
      for (const [key, val] of Object.entries(searchParams)) {
        if (typeof val === "string") {
          params.set(key, val);
        } else if (Array.isArray(val)) {
          for (const item of val) {
            params.append(key, item);
          }
        }
      }
    }
    redirect(`/api/shopify/install?${params.toString()}`);
  }

  redirect("/dashboard");
}

