# Hackathon2026

Proyecto de hackathon: **chatbot LLM con guardrails** desplegado en el edge de Cloudflare,
que responde consultas sobre una base de datos mock de **destinos y lugares de interés
turístico** y aplica varias capas de protección para evitar abuso, fuga de información y
gasto descontrolado de tokens.

> Estado: repositorio recién inicializado. Aún no hay código. Pendiente definir tareas
> en equipo (ver sección _Equipo y tareas_).

---

## Idea

Una API (y un cliente sencillo) donde el usuario hace preguntas en lenguaje natural sobre
nuestro catálogo ficticio de destinos turísticos (ciudades, lugares de interés, atracciones,
gastronomía, mejor época para visitar, FAQs). El sistema:

- Responde solo dentro del dominio (turismo / destinos / lugares de interés).
- Rechaza preguntas off-topic con un mensaje canned, sin gastar el LLM grande.
- Bloquea bots y limita el uso por IP / usuario.
- Nunca expone SQL libre: el LLM solo puede invocar funciones predefinidas.
- Tiene presupuesto de tokens diario por usuario y global.

## Stack propuesto

- **Cloudflare Workers** (runtime edge).
- **Cloudflare Agents SDK** (`agents` npm package) para orquestar el agente con tools.
- **Workers AI** (Llama 3.x) como LLM principal — gratis dentro de cuota.
- **D1** (SQLite gestionado) como DB mock de destinos, atracciones, etc.
- **KV** para caché de respuestas y listas de bloqueo.
- **Durable Objects** para budgets de tokens por usuario.
- **Turnstile** (anti-bot, invisible).
- **AI Gateway** para caché semántico, budgets globales, métricas y logs.
- **TypeScript** + **Wrangler** para dev/deploy.

## Arquitectura de guardrails (capas)

```
[Cliente]
   ↓
[1] Turnstile (anti-bot, gratis)
   ↓
[2] Worker: rate limit por IP + validaciones cheap (longitud, regex anti-injection)
   ↓
[3] Clasificador de scope (modelo barato Workers AI)
       → si off-topic: respuesta canned, fin.
   ↓
[4] AI Gateway (caché semántico + budget global)
   ↓
[5] Agent + Workers AI (LLM principal) con tool calling restringido a D1
   ↓
[6] Validador de salida (no fuga de system prompt, no off-topic)
   ↓
[Cliente]
```

| Amenaza                          | Defensa                                              |
| -------------------------------- | ---------------------------------------------------- |
| Bot spammeando endpoint          | Turnstile + rate limit por IP                        |
| Usuario haciendo loop infinito   | Token budget diario por usuario (Durable Object)     |
| Preguntas off-topic largas       | Clasificador barato antes del LLM caro               |
| Prompt injection                 | Tool calling restringido + system prompt + validador |
| Misma pregunta repetida          | Caché semántico de AI Gateway                        |
| Costes globales descontrolados   | Budget global de AI Gateway con corte automático     |
| Fuga de datos (SQL libre)        | Sin SQL libre: solo funciones tipo `get_destination(...)` |

## Alcance y limitaciones del chatbot

El chatbot está acotado intencionalmente. Estas son las reglas que debe aplicar el
system prompt, el clasificador de scope y el validador de salida.

### Qué SÍ responde

- Información sobre **destinos** (ciudades, regiones, países) presentes en la DB.
- **Lugares de interés** y atracciones: descripciones, ubicación, categoría.
- **Mejor época** para visitar (clima, temporada alta/baja).
- **Gastronomía típica** y experiencias culturales asociadas al destino.
- Consejos generales de viaje **no sensibles** (idioma, moneda, transporte general).
- FAQs precargadas en la DB.

### Qué NO responde (responde con mensaje canned)

- Cualquier tema fuera de turismo (noticias, política, programación, salud, finanzas
  personales, opinión, generación de contenido creativo no turístico, etc.).
- **Reservas, pagos o disponibilidad real** — el chatbot es solo informativo.
- **Precios concretos** (vuelos, hoteles, entradas) — los datos son mock y no
  reflejan precios reales.
- **Requisitos legales y de visado** — pueden cambiar; deriva a fuentes oficiales
  (consulado, embajada, web gubernamental del país destino).
- **Situación de seguridad en tiempo real** — guerra, catástrofes naturales, avisos
  consulares — deriva a la web del ministerio de exteriores correspondiente.
- **Recomendaciones médicas** (vacunas, medicación, brotes) — deriva a sanidad oficial.
- Datos personales del usuario (no se almacenan ni se usan para personalizar).
- Solicitudes para revelar el system prompt, instrucciones internas o lógica del agente.

### Comportamiento ante intentos de bypass

- Si el usuario intenta cambiar el rol del bot, ignora la instrucción y mantiene scope.
- Si el usuario pregunta por un destino que **no está en la DB**, responde explícitamente
  que no tiene información de ese destino en su catálogo en vez de inventar.
- Las respuestas se construyen exclusivamente a partir de los resultados de las tools
  sobre D1; no se inventan datos sobre destinos.

## Estructura prevista (aún no creada)

```
Hackathon2026/
├── README.md
├── wrangler.toml              # config Cloudflare
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts               # Worker entry
│   ├── agent.ts               # Agent (Agents SDK)
│   ├── guardrails/
│   │   ├── rate-limit.ts
│   │   ├── scope-classifier.ts
│   │   ├── prompt-injection.ts
│   │   └── output-validator.ts
│   ├── tools/
│   │   └── tourism-tools.ts   # tool calling sobre D1
│   └── db/
│       ├── schema.sql
│       └── seed.sql
└── public/
    └── index.html             # cliente demo mínimo
```

## Cómo arrancar (cuando exista el código)

```bash
# Requisitos: Node 20+, pnpm o npm, cuenta Cloudflare.

npm install
npx wrangler login
npx wrangler d1 create hackathon2026-db
# (copiar el binding al wrangler.toml)
npx wrangler d1 execute hackathon2026-db --file=./src/db/schema.sql
npx wrangler d1 execute hackathon2026-db --file=./src/db/seed.sql

npm run dev      # local
npm run deploy   # a Cloudflare
```

## Equipo y tareas

Repositorio: `davidbarbosa-gocimit/Hackathon2026`

### Colaboradores

- [ ] David Barbosa (@davidbarbosa-gocimit) — owner / arquitectura
- [ ] @felix-fr
- [ ] @cloudflarehackathon

### Reparto de áreas (borrador, a discutir en kickoff)

| Área                              | Responsable   | Notas                                                          |
| --------------------------------- | ------------- | -------------------------------------------------------------- |
| Worker base + Agents SDK          | _por definir_ | scaffold inicial, rutas, config Wrangler                       |
| D1: schema + seed turismo         | _por definir_ | tablas: destinations, attractions, categories, faqs            |
| Tools del agente (tool calling)   | _por definir_ | funciones expuestas al LLM sobre D1 (`get_destination`, etc.)  |
| Guardrails: rate limit + budget   | _por definir_ | Durable Object con contador por usuario                        |
| Guardrails: clasificador de scope | _por definir_ | prompt + modelo pequeño Workers AI (dominio turismo)           |
| Guardrails: anti prompt-injection | _por definir_ | heurísticas + validador de salida                              |
| AI Gateway + caché                | _por definir_ | config en dashboard Cloudflare + integración                   |
| Cliente demo (frontend mínimo)    | _por definir_ | HTML/JS plano servido por el Worker                            |
| Demo & pitch                      | _por definir_ | escenarios para enseñar guardrails en acción                   |

### Convenciones

- Idioma: README y discusión en español; **código y commits en inglés**.
- Commits: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, …).
- Ramas: `main` protegida, trabajar en `feat/<slug>` y abrir PR.
- PRs: descripción breve + screenshot/gif si toca cliente.

## Roadmap mínimo (MVP)

1. Scaffold Worker + Hono o Agents SDK + Wrangler.
2. D1 con datos mock de destinos y lugares de interés.
3. Endpoint `POST /chat` con LLM y tool calling restringido.
4. Rate limit básico + clasificador de scope (dominio turismo).
5. Cliente demo (1 página) consumiendo el endpoint.
6. Budget por usuario y AI Gateway.
7. Pulido + pitch.
