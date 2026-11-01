# Architecture & Topology Graph (Tier 2 - Lazy Loaded)
> **GRAPHIFY CRUD RULE**: No prose paragraphs. Express architecture strictly as directed edges (`[Source] --(verb/contract)--> [Target]`). Update in-place when modules change.

## Module Dependency Graph (Edges)
- `[Entry/Route]` --(DTO)--> `[Controller/Handler]` --(calls)--> `[DomainService]` --(queries)--> `[Repository/DB]`
- `[DomainService]` --(publishes event)--> `[Queue/Worker]`

## Directory & Layer Map
- `src/...` -> [Responsibility]

## Cross-Cutting Contracts
- **Auth**: `[Request]` -> `[AuthGuard/Middleware]` -> `[Context/UserPrincipal]`
- **Error Handling**: `[Thrown Exception]` -> `[GlobalFilter]` -> `[StandardErrorDTO]`
- **Cache**: `[Service]` -> `[RedisKey: prefix:id (TTL)]`
