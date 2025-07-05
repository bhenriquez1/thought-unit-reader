typescript// pages/_app.tsx
import "@/styles/global.css"
import type { AppProps } from "next/app"
import Head from "next/head"

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <link rel="icon" href="/favicon.ico" />
        <title>Thought-Unit Reader</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="description" content="Advanced biomedical text analysis tool" />
      </Head>
      <Component {...pageProps} />
    </>
  )
}