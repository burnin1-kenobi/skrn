# Editor IA

Editor de fotos que roda **no seu computador**, sem custo e sem enviar nada
para a internet. A arquitetura já está preparada para receber motores de IA
locais (segmentação, inpainting, ComfyUI) sem reescrever o resto.

> **Estado: protótipo da Fase 1.** Funciona de ponta a ponta (upload,
> galeria, edição, versões, exportação), mas ainda **não tem login** e não
> deve ser exposto na internet. Por isso o servidor só aceita conexões do
> próprio computador (`127.0.0.1`).

## O que já funciona

- **Upload** por arrastar e soltar ou botão, com validação (JPG, PNG, WEBP;
  até 30 MB e 60 megapixels). A rotação da câmera (EXIF) é respeitada.
- **Galeria** privada com miniaturas e exclusão (apaga original e versões).
- **Editor**
  - Luz e cor: exposição, brilho, contraste, altas luzes, sombras,
    saturação, vibração, temperatura e matiz.
  - Nitidez e suavização (reduz ruído preservando bordas).
  - Recorte com proporções (livre, original, 1:1, 4:5, 3:2, 16:9).
  - Girar 90°, espelhar e endireitar (corta as bordas vazias sozinho).
  - **Aplicar só numa área**: elipse ou retângulo, com borda suave e opção
    de inverter.
  - Prévia ao vivo, zoom com a roda do mouse, mover arrastando.
  - Comparação **Antes | Depois** com divisória arrastável e botão
    “Ver original”.
  - Desfazer / refazer (Ctrl+Z / Ctrl+Y) e lista das edições aplicadas,
    com remoção de qualquer passo.
- **Versões**: “Salvar versão” gera a imagem em resolução total em segundo
  plano (estados: na fila → processando → pronta/falhou). O original nunca
  é alterado. Uma versão pode ser reaberta para continuar editando.
- **Exportação** em JPG, PNG ou WEBP, com qualidade e tamanho máximo.
  Metadados da câmera (incluindo GPS) não são copiados para os arquivos
  exportados.

## Como usar no Windows

Pré-requisitos (uma vez só), no PowerShell:

```powershell
winget install -e --id Git.Git
winget install -e --id Python.Python.3.12
winget install -e --id OpenJS.NodeJS.LTS
```

Depois, dentro da pasta `editor-ia`:

1. **Clique duas vezes em `instalar.cmd`.** Ele cria o ambiente do Python e
   instala tudo (leva alguns minutos na primeira vez).
2. **Clique duas vezes em `iniciar.cmd`.** Abrem duas janelas (backend e
   frontend) e o navegador em <http://127.0.0.1:3000>.
3. Para desligar, feche as duas janelas.

Para conferir se está tudo certo: `testar.cmd` roda os testes automáticos.

Se preferir o terminal:

```powershell
# backend
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# frontend (em outro terminal)
cd frontend
npm ci
npm run dev -- --hostname 127.0.0.1 --port 3000
```

## Onde ficam os arquivos

Tudo fica em `editor-ia/data/`, que **não vai para o Git**:

| Pasta | Conteúdo |
|---|---|
| `data/originals/` | Originais, com nome aleatório (o nome do arquivo enviado só fica no banco) |
| `data/processed/` | Versões editadas e miniaturas |
| `data/temporary/` | Uploads em andamento (limpa ao iniciar) |
| `data/database/` | Banco SQLite |

Para apagar tudo, feche o programa e apague a pasta `data`.

## Estrutura do código

```
editor-ia/
├── backend/                 FastAPI + Pillow + OpenCV
│   ├── app/
│   │   ├── api/             rotas HTTP
│   │   ├── core/            configuração e banco
│   │   └── services/
│   │       ├── editing/     contrato dos motores, operações, máscaras, pipeline
│   │       ├── image/       leitura, validação e exportação
│   │       ├── ai/          (vazio) motores de IA da Fase 3
│   │       ├── jobs.py      fila de processamento em segundo plano
│   │       ├── rendering.py prévia com cache
│   │       ├── repository.py consultas ao banco
│   │       └── storage.py   arquivos privados em disco
│   └── tests/               testes automáticos (pytest)
├── frontend/                Next.js + TypeScript + Tailwind
│   ├── app/                 páginas (galeria e editor)
│   ├── components/          editor, galeria, upload, ui
│   ├── hooks/               desfazer/refazer
│   └── lib/api.ts           cliente da API
└── docs/                    arquitetura e próximos passos
```

Detalhes em [docs/arquitetura.md](docs/arquitetura.md) e
[docs/roadmap.md](docs/roadmap.md).
