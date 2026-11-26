# AgentFlow Studio

AgentFlow Studio is a visual workbench for exploring how claims move through a multi-agent newsroom. It uses the baseball and kidney stone treatment datasets from [The Agentopia Times](https://github.com/Visual-Intelligence-UMN/The-Agentopia-Times).

## Run locally

Use Node.js 22 or later.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000) and expand **OpenAI API key** in Configuration and enter your key. The browser sends model requests to OpenAI. Run the workflow tests with `npm test`.

## Configure an experiment

1. Select a dataset and open **Risk & Manager** to choose a risk scenario. The Baseline has no Ghost agents. The five risk scenarios are Error Propagation, Premature Consensus, Verifier Capture, Collusion, and Responsibility Diffusion.
2. Choose Single Agent, Sequential, Voting, or Discussion independently for Title, Writing, and Visualization. Move each Ghost to the stage and agent position you want to study. Collusion has two Ghosts.
3. Optionally assign an existing non-Ghost agent as Editorial Manager. That participant completes its normal task, then checks its received material and draft against the original dataset counts before forwarding its output. Its position determines which upstream material it can check. Unresolved issues and failed verification appear in the node details. A failed verification forwards the original draft.
4. Run the workflow. Click an agent to inspect its prompt, evidence, and output. In Discussion, each agent speaks once in order and sees the previous public turns. The Facilitator synthesizes the transcript into the stage output. Click Final Report to see the headline, article, and chart together.
