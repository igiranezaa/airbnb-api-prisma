import { ChatGroq } from "@langchain/groq";

export const model = new ChatGroq({
  model: "llama-3.1-8b-instant",
  temperature: 0.7,
  apiKey: process.env["GROQ_API_KEY"],
});

export const deterministicModel = new ChatGroq({
  model: "llama-3.1-8b-instant",
  temperature: 0,
  apiKey: process.env["GROQ_API_KEY"],
});
