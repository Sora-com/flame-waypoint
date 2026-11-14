# Flame Waypoint

NASA Space Apps Challenge 2026 · **Flame in Freefall** · Team **Pyromancer**

A discovery tool for NASA Physical Sciences Informatics (PSI) microgravity combustion data:
search, compare and rank investigations by relevance to spacecraft and Moon base fire-safety conditions,
using a local open-weights LLM.

> Work in progress — built during the hackathon (Nov 14–15, 2026).

## Ask the data locally
The public dashboard shows **pre-computed** answers in *Ask the data*. Asking your own questions in natural
language **requires downloading and running the assistant on your computer**.

### Requirements
- [Ollama](https://ollama.com), the local model runtime.
- A model: `mistral-nemo` (default, one-time download of about 7 GB, needs about 10 GB of free memory) or
  `ministral-3:3b` (about 3 GB, faster but less accurate).
- Python 3.10 or later. Only the standard library is used: there is nothing to `pip install`.

### Run it
```sh
git clone https://github.com/Sora-com/flame-waypoint.git
cd flame-waypoint
ollama pull mistral-nemo              # one-time download
python3 -m pipeline.ask.server        # keep this terminal open
```

Open <http://localhost:8000/#/ask> (or press `0` anywhere in the dashboard). The label next to the title
reads **live · mistral-nemo on this computer** when the model is reachable. Type a question, or click one of
the suggested questions, for example:

- *What is the lowest pressure tested at 30 % oxygen or more, and in which experiment?*
- *Which experiments burned solid materials, and at what flow speeds?*
- *Which materials were burned in Saffire-II and what was learned?*

The whole dashboard is served from the same address, so the other views work as usual.

Options:

```sh
python3 -m pipeline.ask.server --model ministral-3:3b   # smaller model (run `ollama pull ministral-3:3b` first)
python3 -m pipeline.ask.server --port 8080              # another port
```

The assistant can also be called without the dashboard:

```sh
curl -s localhost:8000/api/ask -H 'Content-Type: application/json' \
     -d '{"question": "Which experiments used oxygen concentrations above 21 %?"}'
```

### How to read an answer
- Each statement cites its source: `[PSI-69]` opens the investigation, `[ntrs:…]` links to the NASA paper and
  `[glossary]` refers to the dashboard glossary.
- Numbers such as ranges, rankings, completeness and the distance to each scenario are computed in Python
  from the data; the model only phrases them. For ambiguous questions ("most complete", "most similar") it
  states the criterion it used.
- A yellow **Not found in the cited sources** note marks statements containing words or numbers that the
  cited sources do not contain. Treat those statements as unverified.
- *Context given to the model* shows exactly what the model saw.
- The footer gives the time, the tokens and an energy estimate. Each answer takes about 10–15 s with
  `mistral-nemo` on an Apple M3 Pro, and that cost is included in the dashboard's energy budget.

Everything runs offline: no question or data leaves your computer.

### Troubleshooting
- *Label says "pre-computed answers"*: the page is not served by `pipeline.ask.server`, or Ollama is not
  running. Start Ollama (open the app, or run `ollama serve`) and reload the page.
- *"model not available" warning when starting*: run `ollama pull mistral-nemo`, or the model passed
  with `--model`.
- *The first answer is slow*: the model is loaded into memory on the first question (about 10 s).

### Maintainers: refresh the pre-computed answers
After the data changes, regenerate the answers published on the public dashboard and review them:

```sh
python3 -m pipeline.ask.demo                        # writes data/ask/demo.json
python3 -m pipeline.build.site_data --include-tables  # local preview; GitHub Pages rebuilds on push
```

## Data sources
- [NASA PSI Data Repository: Combustion Science](https://psi.nasa.gov/physci/repo/search?q=combustion)

## Use of AI tools
To be documented before submission.

## License
MIT
