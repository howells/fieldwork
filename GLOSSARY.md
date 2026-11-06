# Fieldwork

One API over many web search, scrape, crawl and parse providers.

## Language

**Job**: Work a provider runs in the background after one request starts it: a research run, a crawl, a batch scrape, a parse. It has an id from the moment it starts, and Fieldwork waits for it by checking it. Every job runs through `runJob` in `packages/fieldwork-sdk/src/job.ts`, which resumes a job named by `resume` instead of starting another and gives every later error the job's id as `jobId`.
