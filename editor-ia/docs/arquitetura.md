# Arquitetura

```
Navegador (Next.js) ──HTTP──▶ API (FastAPI) ──▶ Pipeline de edição ──▶ Operações (motores)
                                   │                                    ├─ clássicas (OpenCV/NumPy)
                                   │                                    └─ IA (Fase 3, app/services/ai)
                                   ├──▶ Fila de trabalhos (threads) ──▶ versões em resolução total
                                   ├──▶ SQLite (metadados)
                                   └──▶ data/ (arquivos privados)
```

## Decisões principais

**Edição não destrutiva.** Uma edição é uma lista de operações
(`[{op, params, region?}]`). A prévia e a versão final são sempre
recalculadas a partir do original. Por isso dá para reabrir uma versão,
remover um passo do meio ou desfazer sem perda de qualidade.

**Parâmetros independentes da resolução.** Recortes e regiões usam
coordenadas de 0 a 1; raios de nitidez e suavização são porcentagens do
maior lado. A prévia (até 1600 px) e a exportação (resolução total) ficam
iguais.

**Contrato único para motores.** Toda operação implementa
`app/services/editing/base.py::Operation` e declara: id, nome, categoria,
parâmetros com limites, se aceita região, se é geométrica, versão, licença e
requisitos de hardware (`EngineInfo`). O frontend monta os controles a
partir de `GET /api/operations`, então um motor novo aparece na interface
sem mexer no frontend.

**Sem infraestrutura antes da hora.** Fila com threads e estado no banco
(`pending → processing → completed/failed`) em vez de Redis/Celery; SQLite
em vez de PostgreSQL. As consultas ficam isoladas em `repository.py` e a
fila em `jobs.py`, que são os únicos pontos a trocar depois.

## Como adicionar um motor de IA (Fase 3)

1. Criar `backend/app/services/ai/<nome>.py` com uma classe que herda de
   `Operation`, com `engine = EngineInfo(kind="ai", requires_gpu=True,
   min_vram_gb=..., license="...")`.
2. Carregar o modelo de forma preguiçosa (na primeira chamada), não ao
   importar, para o servidor continuar abrindo rápido sem GPU.
3. Registrar com `registry.register(...)` e escrever testes com imagens
   sintéticas.

## API

| Método | Rota | Uso |
|---|---|---|
| GET | `/api/health` | Servidor no ar e limites |
| GET | `/api/operations` | Catálogo de operações e parâmetros |
| POST | `/api/images` | Upload (multipart, campo `file`) |
| GET | `/api/images` | Galeria |
| GET | `/api/images/{id}` | Detalhes e versões |
| DELETE | `/api/images/{id}` | Apaga original, versões e miniaturas |
| GET | `/api/images/{id}/original` · `/thumbnail` | Arquivos |
| POST | `/api/images/{id}/preview` | Prévia reduzida de uma lista de operações (não salva) |
| POST | `/api/images/{id}/versions` | Salva versão (processa em segundo plano, 202) |
| GET / DELETE | `/api/versions/{id}` | Estado / apagar versão |
| GET | `/api/versions/{id}/thumbnail` | Miniatura |
| GET | `/api/versions/{id}/export?format=jpeg\|png\|webp&quality=&max_side=` | Download |

Documentação interativa: <http://127.0.0.1:8000/docs> com o backend ligado.

## Segurança na Fase 1

- Servidor ouvindo só em `127.0.0.1`; CORS liberado só para o frontend local.
- Arquivos com nomes aleatórios, fora de qualquer pasta pública, servidos
  apenas pela API; caminhos validados para não sair de `data/`.
- Validação real do conteúdo (não da extensão), limite de tamanho e de
  megapixels (proteção contra “bombas” de descompressão).
- Nomes de arquivo e conteúdo das imagens não vão para os logs.
- Exportações sem metadados EXIF/GPS.
- **Ainda não há login.** Todas as consultas já filtram por dono
  (`owner_id`), então a autenticação da Fase 5 entra em `api/deps.py`
  sem mudar as rotas.
