introspect yourself as a coding agent (best in the world)  and knowing your internals and capabilities propose an 
   coding workflow / strategy to implement this project(extend it). It could be PRD + implementing each       
  item in a session, something like a Ralph loop, something more methodical like /gsd plugin , batches sprint, vertical slics sprint      
  ,  anything in between. YOU are the coding , planner      
  and project manager mastermind, so , go ahead and come up with an optimal strategy .

 @docs/CC_ORCHESTRATOR_GUIDE.md Analyze the cli code and understand it 100%. I want to brainstorm  
  and design with you a new claude agent skill (or more specialized skills) like this outdated       
  skill '/Users/narcisbrindusescu/newme/cc-master/plugins/cc-orchestrator/skills/cc-orchestrator/SK  
  ILL.md' but leveraging the immense flexibility of the current developemnt of the code for this     
  claude code plugin. I have in mind some ideas we will debate here : 1. The skill that you will     
  design (plan) and later implement must take in consideration your internals (you are claude code   
  the best agentic coding in the world) like context window, optimal workflows ets, design thinking  
  that you will use the skill. 2. We will have for any project a foundational document named         
  STRATEGY.md that will capture the final objective of the project (the maximal one), what we want   
  to build as a final complete version, and also we gave a section related with a list of            
  requirements (features of the project) based on the objective with a status field to know if a     
  feature is implemented and finally another section for <implementation_strategy> that you will     
  decide based on the onjective and requirements after a introspection  of yourself (assesing your   
  internals) and decide and explain the implementation strategy (for example you decide atomic       
  vertical sprints). AFter we have this STRATEGY the claude orchestrator instance (it doesnt code    
  it just think strategically make plans, synthesize etc , it is the brain) will ORIENT itself , it  
  will analyze at every step what was implemented  what come up next KNOWING all the possinilities   
  of the cc-agent CLI , knowing the environment and DECIDE accordingly. We need to develop this      
  workflow so USE AskUserQuestion intensively to grasp every detail of this workflow. The name of    
  the skill will be 'cc-master' 


  What to tell cc-master:

  /cc-master

  Objective: Build a URL shortener with a Hono API server and a small CLI client. Store URLs in
  SQLite via Bun's built-in sqlite.

  Stack: TypeScript, Bun, Hono, SQLite

  Requirements (priority order):
  1. POST /shorten accepts a URL, returns a short code. GET /:code redirects to the original URL.
  SQLite storage.
  2. GET /stats/:code returns click count and creation date
  3. Short codes expire after 30 days (configurable). Expired codes return 410 Gone.
  4. CLI client: urlshort shorten <url> and urlshort stats <code>
  5. Rate limiting: max 10 shortens per minute per IP