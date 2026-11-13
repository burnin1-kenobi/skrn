# Próximos passos

## Fase 1 — Fundação ✅
Upload, galeria, editor com ajustes, regiões, recorte, rotação, comparação,
histórico, versões em segundo plano e exportação. Testes automáticos do
backend (34) e teste ponta a ponta no navegador.

## Fase 2 — Editor mais completo
- Pincel de máscara (pintar/apagar a área em vez de só elipse/retângulo).
- Mover e redimensionar a região depois de desenhada (alças).
- Curvas e HSL por cor.
- Prévia em resolução maior quando o zoom passa de 100%.
- Testes do frontend (Playwright) versionados no repositório.

## Fase 3 — IA local (RTX 4060, 8 GB)
Ordem sugerida, do mais leve ao mais pesado:
1. **SAM 2 (tiny/small)**: seleção inteligente com um clique, gerando a
   máscara para as operações que já aceitam região.
2. **Remoção de fundo** (BiRefNet ou RMBG — conferir licença antes).
3. **Aumento de resolução** (Real-ESRGAN).
4. **Inpainting** (apagar objetos) via ComfyUI ou diffusers com modelos
   SD 1.5/SDXL de inpainting.
Cada um entra como `Operation` em `app/services/ai/` e precisa de: licença
conferida, requisitos de VRAM, testes com imagens sintéticas.

## Fase 4 — Ferramentas e presets
Presets de ajuste, aplicação em lote, atalhos personalizáveis.

## Fase 5 — Plataforma
Login, PostgreSQL, armazenamento privado remoto, preparação para
hospedagem. Só depois de validar o uso real.
