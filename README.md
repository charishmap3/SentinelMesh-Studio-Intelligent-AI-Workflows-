# 🚀 SentinelMesh Studio

## Intelligent AI Workflows

An Enterprise AI Workflow Orchestration Platform that enables organizations to visually build, execute, monitor, and optimize intelligent workflows using Artificial Intelligence, Large Language Models, and LangGraph.

---

# 📖 Introduction

Traditional workflow automation platforms rely on predefined rules and require significant manual intervention for routing, monitoring, and resolving failures.

SentinelMesh Studio introduces an AI-native workflow platform that enables users to design intelligent workflows through a visual drag-and-drop interface. Large Language Models understand unstructured data, classify emails, extract important information, intelligently route workflows, and monitor execution in real time.

The platform also incorporates execution monitoring, failure detection, and RAG-based incident diagnosis to improve workflow reliability and reduce manual effort. 

---

# ❗ Problem Statement

Organizations process thousands of emails, service requests, approvals, and operational tasks every day.

Traditional workflow systems:

- Depend on static business rules
- Cannot understand unstructured information
- Require manual routing
- Provide limited execution visibility
- Require manual debugging during failures

These limitations reduce operational efficiency and increase processing time. 

---

# 🎯 Objectives

- Design an interactive AI workflow builder
- Automate email understanding using AI
- Enable intelligent workflow routing
- Integrate Large Language Models
- Monitor workflow execution
- Detect runtime failures
- Retrieve similar incidents using RAG
- Improve workflow reliability and operational efficiency 

---

# 💡 Proposed System

SentinelMesh Studio provides:

- AI-powered workflow automation
- Visual drag-and-drop workflow builder
- Intelligent email understanding
- AI-based classification
- Information extraction
- Intelligent routing
- Real-time execution monitoring
- Runtime failure detection
- RAG-based incident diagnosis
- Interactive monitoring dashboard 

---

# ✨ Features

## 🎨 Visual Workflow Builder

- Drag-and-drop workflow canvas
- Interactive workflow editor
- Save and load workflows
- Enterprise workflow dashboard
- Real-time node connections

---

## 🤖 AI Workflow Nodes

Available nodes include:

- Email Trigger
- LLM
- Classifier
- Extractor
- Summarizer
- Router
- Condition
- Delay
- End Node

Each node can be configured using custom AI prompts and runtime settings.

---

## 📧 Gmail Integration

- Google OAuth Login
- Gmail API Integration
- Email Trigger
- Email Classification
- Email Processing
- Automated Email Routing

---

## 🧠 AI Workflow Execution

Powered by LangGraph.

Supports:

- Workflow execution
- AI agent execution
- Conditional routing
- Dynamic prompt execution
- Variable passing
- Workflow monitoring

---

## 📊 Execution Monitoring

Real-time dashboard showing:

- Workflow Status
- Execution Progress
- Node Status
- Execution Timeline
- Execution Logs
- AI Responses
- Incident Dashboard
- Workflow Health

---

## 🔍 RAG-Based Incident Diagnosis

When a workflow fails, SentinelMesh Studio:

- Detects execution failures
- Identifies possible root causes
- Retrieves similar historical incidents
- Suggests recovery recommendations
- Displays workflow health information

---

# 🏗️ System Architecture

```
                  User

                    │

                    ▼

      Drag & Drop Workflow Builder
          (React + React Flow)

                    │

                    ▼

         Workflow Configuration

                    │

                    ▼

            FastAPI Backend

                    │

                    ▼

       LangGraph Execution Engine

                    │

        ┌───────────┼────────────┐
        │           │            │
        ▼           ▼            ▼

    AI Agent    Email Node    Router

        │           │            │
        └───────────┼────────────┘

                    ▼

         Workflow Monitoring

                    ▼

          Failure Detection

                    ▼

      RAG Incident Retrieval

                    ▼

     Dashboard & Recommendations
```

---

# 🛠 Technology Stack

## Frontend

- React.js
- TypeScript
- Vite
- React Flow
- Tailwind CSS
- Axios

## Backend

- Python
- FastAPI
- Uvicorn
- Pydantic
- HTTPX

## AI & Workflow

- LangGraph
- AI Agents
- Groq LLM / OpenAI Compatible Models

## Integrations

- Gmail API
- Google OAuth 2.0

## Development Tools

- Git
- GitHub
- VS Code
- Pytest 

---

# 📂 Project Structure

```
SentinelMesh Studio

├── frontend
│   ├── components
│   ├── hooks
│   ├── pages
│   ├── services
│   └── workflow
│
├── backend
│   ├── api
│   ├── graph
│   ├── services
│   ├── templates
│   ├── agents
│   └── models
│
├── tests
│
└── README.md
```

---

# 🚀 Implementation

The platform was developed using:

- React.js and React Flow for the visual workflow builder
- FastAPI for backend REST APIs
- LangGraph for workflow execution
- AI Agents for extraction, summarization, classification, and routing
- Gmail API with Google OAuth 2.0 for email integration
- Real-time workflow monitoring dashboard 

---

# 📊 Current Modules

- Workflow Builder
- AI Workflow Engine
- Email Integration
- Enterprise Templates
- AI Agent Library
- Execution Dashboard
- Workflow Monitoring
- Failure Detection
- RAG Incident Diagnosis

---

# 🔮 Future Scope

- Predict failures using Machine Learning
- AWS, Azure, and Google Cloud support
- Reinforcement Learning for smarter recovery
- AI-powered cybersecurity monitoring
- Natural Language workflow assistant
- Kubernetes deployment
- Advanced analytics and reporting 

---

# 🎓 Team

**BNM Institute of Technology**

Department of Artificial Intelligence & Machine Learning

### Team Members

- Charishma P D
- Madhugna Yelchuri
- Pallavi P Kundapur 

---


<div align="center">

⭐ **SentinelMesh Studio – Intelligent AI Workflows**

*Design • Execute • Monitor • Diagnose*

</div>
