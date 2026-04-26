import Anthropic from '@anthropic-ai/sdk';
import SYSTEM_PROMPT from '../lib/system_prompt.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function logTrace({ session_id, messages, response, usage, latency_ms }) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return;
  const payload = {
    session_id,
    messages,
    response,
    input_tokens: typeof usage?.input_tokens === 'number' ? usage.input_tokens : null,
    output_tokens: typeof usage?.output_tokens === 'number' ? usage.output_tokens : null,
    latency_ms,
  };
  console.log('logTrace usage:', JSON.stringify(usage));
  console.log('logTrace payload keys:', Object.keys(payload));
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/traces?on_conflict=session_id`, {
    method: 'POST',
    headers: {
      'apikey': process.env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase traces insert failed (${res.status}): ${body}`);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { session_id, messages } = req.body;

  if (!session_id || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Missing session_id or messages' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const startTime = Date.now();
  let fullResponseText = '';

  try {
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        fullResponseText += event.delta.text;
        res.write(`data: ${JSON.stringify({ type: 'delta', text: event.delta.text })}\n\n`);
      }
    }

    const finalMessage = await stream.finalMessage();
    const latency_ms = Date.now() - startTime;

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();

    logTrace({
      session_id,
      messages,
      response: fullResponseText,
      usage: finalMessage.usage,
      latency_ms,
    }).catch(err => console.error('Supabase log error:', err));
  } catch (err) {
    console.error('Claude API error:', err);
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Something went wrong. Please try again.' })}\n\n`);
    res.end();
  }
}
