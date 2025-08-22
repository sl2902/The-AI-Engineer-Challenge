import Head from "next/head";
import { Geist, Geist_Mono } from "next/font/google";
import styles from "@/styles/Home.module.css";
import { useState } from "react"; // Remove FormEvent if not used

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [developerMessage, setDeveloperMessage] = useState("");
  const [userMessage, setUserMessage] = useState("");
  const [responseText, setResponseText] = useState("");
  const [loading, setLoading] = useState(false);
  const [invalidApiKey, setInvalidApiKey] = useState(false);

  // ← The function needs to be HERE, inside the component
  const callChatAPI = async () => {
    setInvalidApiKey(false); // Reset error state
    if (!apiKey) {
      alert("OpenAI API key is required!");
      return;
    }

    setLoading(true);
    setResponseText("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          developer_message: developerMessage,
          user_message: userMessage,
          model: "gpt-4o-mini",
          api_key: apiKey,
        }),
      });

      if (response.status === 401 || response.status === 403) {
        alert("Invalid API key. Please check and try again.");
        setInvalidApiKey(true);
        setResponseText("");
        return;
      }

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('ReadableStream not supported in this browser.');
      }
      const decoder = new TextDecoder();
      let done = false;
      let text = "";

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          text += decoder.decode(value);
          setResponseText(text);
        }
      }
    } catch (error) {
      setResponseText(`Error: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <Head>
      <title>The AI Engineer Challenge</title>
      <meta name="description" content="Build modern AI powered apps with ease." />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
    </Head>
    <div className={`${styles.page} ${geistSans.variable} ${geistMono.variable}`}> 
      <main className={styles.main}>
        <h1 className={styles.title}>The AI Engineer Challenge</h1>

        <label htmlFor="apiKey" className={styles.label}>
          OpenAI API Key
        </label>
        <input
          id="apiKey"
          type="password"
          className={styles.textarea}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Paste your OpenAI API key"
        />

        <label htmlFor="developerMessage" className={styles.label}>
          Developer Message
        </label>
        <textarea
          id="developerMessage"
          className={styles.textarea}
          value={developerMessage}
          onChange={(e) => setDeveloperMessage(e.target.value)}
          rows={3}
          placeholder="Enter developer message here"
        />

        <label htmlFor="userMessage" className={styles.label}>
          User Message
        </label>
        <textarea
          id="userMessage"
          className={styles.textarea}
          value={userMessage}
          onChange={(e) => setUserMessage(e.target.value)}
          rows={3}
          placeholder="Enter user message here"
        />

        <button
          className={styles.primaryButton}
          onClick={callChatAPI}
          disabled={loading || !userMessage}
        >
          {loading ? "Loading..." : "Send"}
        </button>

        <div className={styles.response}>
          {invalidApiKey && (
            <p style={{ color: "red", fontWeight: "bold" }}>
              Invalid API key. Please check and try again.
            </p>
          )}
          <h2>Response:</h2>
          <div>{responseText.split('\n').map((line, idx) => (
            <p key={idx} style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{line}</p>
          ))}</div>
        </div>
      </main>
    </div>
  </>
  );
}