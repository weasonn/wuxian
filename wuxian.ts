import requests
import json
import uuid
import datetime
import time
import traceback
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse
import httpx
from fake_useragent import UserAgent

app = FastAPI()
ua_generator = UserAgent()

def get_random_headers():
    user_agent = ua_generator.random
    
    headers = {
        'content-type': 'application/json',
        'user-agent': user_agent,
        'origin': "https://unlimitedai.chat",
        'referer': "https://unlimitedai.chat",
        'accept': 'text/event-stream',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'no-cache',
        'pragma': 'no-cache',
        'sec-ch-ua': '"Not A;Brand";v="99", "Chromium";v="99", "Google Chrome";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin'
    }
    return headers

def transform_message(msg):
    parts = []

    if 'content' in msg:
        parts.append({'type': 'text', 'text': msg['content']})

    transformed_msg = {
        'id': msg.get('id', str(uuid.uuid4())),
        'createdAt': msg.get('createdAt', datetime.datetime.now().isoformat() + 'Z'),
        'role': msg['role'],
        'content': msg['content'],
        'parts': msg.get('parts', parts)
    }
    if msg['role'] == 'assistant' and 'reasoning_content' in msg and msg['reasoning_content']:
        transformed_msg['reasoning'] = msg['reasoning_content']
    
    return transformed_msg

def chat_completion(model, messages):
    completion_id = str(uuid.uuid4())

    transformed_messages = []
    for msg in messages:
        transformed_messages.append(transform_message(msg))

    payload = {
        'id': completion_id,
        'messages': transformed_messages,
        'selectedChatModel': model
    }

    headers = get_random_headers()
    try:
        response = requests.post('https://app.unlimitedai.chat/api/chat', headers=headers, json=payload, stream=True, timeout=60)
        response.raise_for_status()  # 抛出HTTP错误
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=f"Error connecting to upstream API: {str(e)}")

    content = ''
    reasoning_content = ''
    finish_reason = None
    
    try:
        for line in response.iter_lines():
            if line:
                decoded_line = line.decode('utf-8')
                if decoded_line.startswith('0:'):
                    try:
                        content_part = json.loads(decoded_line[2:])
                        content += content_part
                    except json.JSONDecodeError:
                        content += decoded_line[2:]
                elif decoded_line.startswith('g:'):
                    try:
                        reasoning_part = json.loads(decoded_line[2:])
                        reasoning_content += reasoning_part
                    except json.JSONDecodeError:
                        reasoning_content += decoded_line[2:]
                elif decoded_line.startswith('e:'):
                    try:
                        e_data = json.loads(decoded_line[2:])
                        finish_reason = e_data.get('finishReason')
                    except json.JSONDecodeError:
                        finish_reason = "stop"
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing response: {str(e)}")

    timestamp = int(time.time())
    response_json = {
        'id': f'chatcmpl-{completion_id}',
        'object': 'chat.completion',
        'created': timestamp,
        'model': model,
        'choices': [
            {
                'message': {
                    'role': 'assistant',
                    'content': content,
                    'reasoning_content': reasoning_content if reasoning_content else None
                },
                'finish_reason': finish_reason if finish_reason else 'stop',
                'index': 0
            }
        ],
        'usage': {
            'prompt_tokens': 0,
            'completion_tokens': 0,
            'total_tokens': 0,
            'prompt_tokens_details': {
                'text_tokens': 0,
                'audio_tokens': 0,
                'image_tokens': 0,
                'cached_tokens': 0
            },
            'completion_tokens_details': {
                'reasoning_tokens': len(reasoning_content) // 4 if reasoning_content else 0,
                'audio_tokens': 0,
                'accepted_prediction_tokens': 0,
                'rejected_prediction_tokens': 0
            }
        },
        'system_fingerprint': f'fp_{uuid.uuid4().hex[:11]}'
    }
    return response_json

async def stream_chat_completion(model, messages, include_reasoning=False):
    completion_id = str(uuid.uuid4())
    timestamp = int(time.time())
    system_fingerprint = f'fp_{uuid.uuid4().hex[:11]}'
    
    transformed_messages = []
    for msg in messages:
        transformed_messages.append(transform_message(msg))

    payload = {
        'id': completion_id,
        'messages': transformed_messages,
        'selectedChatModel': model
    }
    
    headers = get_random_headers()
    
    initial_chunk = {
        "id": f"chatcmpl-{completion_id}",
        "object": "chat.completion.chunk",
        "created": timestamp,
        "model": model,
        "choices": [{
            "index": 0,
            "delta": {"role": "assistant"},
            "finish_reason": None
        }],
        "system_fingerprint": system_fingerprint
    }
    yield f"data: {json.dumps(initial_chunk)}\n\n"
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                async with client.stream('POST', 'https://app.unlimitedai.chat/api/chat', 
                                      headers=headers, 
                                      json=payload) as response:
                    
                    response.raise_for_status()
                    
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                            
                        if line.startswith('f:'):
                            continue

                        elif line.startswith('g:'):
                            if include_reasoning:
                                try:
                                    reasoning_text = json.loads(line[2:])
                                except json.JSONDecodeError:
                                    reasoning_text = line[2:]
                                
                                chunk = {
                                    "id": f"chatcmpl-{completion_id}",
                                    "object": "chat.completion.chunk",
                                    "created": timestamp,
                                    "model": model,
                                    "choices": [{
                                        "index": 0,
                                        "delta": {
                                            "reasoning_content": reasoning_text
                                        },
                                        "finish_reason": None
                                    }],
                                    "system_fingerprint": system_fingerprint
                                }
                                yield f"data: {json.dumps(chunk)}\n\n"

                        elif line.startswith('0:'):
                            try:
                                content_part = json.loads(line[2:])
                            except json.JSONDecodeError:
                                content_part = line[2:]
                            
                            chunk = {
                                "id": f"chatcmpl-{completion_id}",
                                "object": "chat.completion.chunk",
                                "created": timestamp,
                                "model": model,
                                "choices": [{
                                    "index": 0,
                                    "delta": {"content": content_part},
                                    "finish_reason": None
                                }],
                                "system_fingerprint": system_fingerprint
                            }
                            yield f"data: {json.dumps(chunk)}\n\n"
                            
                        elif line.startswith('e:') or line.startswith('d:'):
                            try:
                                e_data = json.loads(line[2:])
                                finish_reason = e_data.get('finishReason', 'stop')
                            except json.JSONDecodeError:
                                finish_reason = "stop"
                            
                            final_chunk = {
                                "id": f"chatcmpl-{completion_id}",
                                "object": "chat.completion.chunk",
                                "created": timestamp,
                                "model": model,
                                "choices": [{
                                    "index": 0,
                                    "delta": {},
                                    "finish_reason": finish_reason
                                }],
                                "system_fingerprint": system_fingerprint
                            }
                            yield f"data: {json.dumps(final_chunk)}\n\n"
                            yield "data: [DONE]\n\n"
                            return
            except httpx.HTTPStatusError as e:
                error_msg = f"HTTP error {e.response.status_code}: {e.response.text}"
                error_chunk = {
                    "id": f"chatcmpl-{completion_id}",
                    "object": "chat.completion.chunk",
                    "created": timestamp,
                    "model": model,
                    "choices": [{
                        "index": 0,
                        "delta": {"content": f"Error: {error_msg}"},
                        "finish_reason": "error"
                    }],
                    "system_fingerprint": system_fingerprint
                }
                yield f"data: {json.dumps(error_chunk)}\n\n"
                yield "data: [DONE]\n\n"
                return
            except httpx.RequestError as e:
                error_msg = f"Network error: {str(e)}"
                error_chunk = {
                    "id": f"chatcmpl-{completion_id}",
                    "object": "chat.completion.chunk",
                    "created": timestamp,
                    "model": model,
                    "choices": [{
                        "index": 0,
                        "delta": {"content": f"Error: {error_msg}"},
                        "finish_reason": "error"
                    }],
                    "system_fingerprint": system_fingerprint
                }
                yield f"data: {json.dumps(error_chunk)}\n\n"
                yield "data: [DONE]\n\n"
                return
    
    except Exception as e:
        error_details = traceback.format_exc()
        error_chunk = {
            "id": f"chatcmpl-{completion_id}",
            "object": "chat.completion.chunk",
            "created": timestamp,
            "model": model,
            "choices": [{
                "index": 0,
                "delta": {"content": f"Error: {str(e)}\n{error_details}"},
                "finish_reason": "error"
            }],
            "system_fingerprint": system_fingerprint
        }
        yield f"data: {json.dumps(error_chunk)}\n\n"
        yield "data: [DONE]\n\n"

@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    try:
        data = await request.json()
        model = data.get('model')
        messages = data.get('messages')
        stream = data.get('stream', False)
        include_reasoning = data.get('include_reasoning', False)
        
        if not model or not messages:
            raise HTTPException(status_code=400, detail="Missing model or messages")
        
        if stream:
            return StreamingResponse(
                stream_chat_completion(model, messages, include_reasoning),
                media_type="text/event-stream"
            )
        else:
            response = chat_completion(model, messages)
            return response
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON in request body")
    except Exception as e:
        error_details = traceback.format_exc()
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}\n{error_details}")

@app.get("/health")
async def health_check():
    return {"status": "ok", "timestamp": datetime.datetime.now().isoformat()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=5000)
