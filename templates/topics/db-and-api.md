# Database & API Graph (Tier 2 - Lazy Loaded)
> **GRAPHIFY CRUD RULE**: Use compact entity-relationship edges (`[EntityA] 1--N [EntityB]`) and endpoint contracts. Update in-place when schemas or endpoints change.

## Entity Relationship Graph (ER Edges)
- `[users (id)]` 1--N `[orders (user_id)]` 1--N `[order_items (order_id)]`
- **Migrations Cmd (Quiet)**: [e.g., `php artisan migrate --force` / `dotnet ef database update`]

## API & External Integration Edges
- `POST /api/v1/resource` --(Auth: Bearer, Body: CreateDto)--> `[ResourceController::store]` --(201)--> `ResourceResponse`
- `[InternalService]` --(REST/gRPC + RetryPolicy)--> `[ExternalProviderAPI]`
