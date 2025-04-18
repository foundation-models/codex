import os
from openai import AzureOpenAI
from dotenv import load_dotenv

endpoint = "https://ask-intapp-ent-gpt-models.openai.azure.com/"
model_name = "o4-mini"
deployment = "o4-mini"
load_dotenv()


subscription_key = os.getenv("AZURE_OPENAI_API_KEY")
api_version = "2024-12-01-preview"

client = AzureOpenAI(
    api_version=api_version,
    azure_endpoint=endpoint,
    api_key=subscription_key,
)

response = client.chat.completions.create(
    messages=[
        {
            "role": "system",
            "content": "You are a helpful assistant.",
        },
        {
            "role": "user",
            "content": "I am going to Paris, what should I see?",
        }
    ],
    max_completion_tokens=100000,
    model=deployment
)

print(response.choices[0].message.content)
