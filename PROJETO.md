# 📦 Armário Digital - Documento Arquitetural e Roadmap (B2B Focus)

## 1. Visão Geral do Produto
O **Armário Digital** é um aplicativo mobile local-first de alta performance para controle de estoque e inventário, construído em React Native (Expo)[cite: 1]. O foco principal do sistema é atender pequenos e médios negócios (B2B) oferecendo segurança, velocidade e auditoria de dados, mantendo suporte secundário para uso doméstico através de perfis (Casa / Negócios)[cite: 1].

## 2. Pilares de Arquitetura e Segurança
- **Framework:** React Native via Expo SDK 58+[cite: 1].
- **Banco de Dados (Local-First):** SQLite para máxima privacidade e velocidade. A estrutura relacional (Espaços -> Itens) suporta operações ACID e a persistência de imagens utiliza o `expo-file-system` para evitar perda de dados por limpeza de cache do OS[cite: 1].
- **Visão Computacional (Edge AI):** Processamento local offline. Utilização do `react-native-fast-tflite` para rodar modelos YOLO[cite: 1], permitindo contagem de lotes, leitura rápida de código de barras e sugestão de nomes de produtos sem chamadas de rede.
- **Integração de Dados:** O sistema deve suportar interoperabilidade padrão B2B, permitindo a importação/exportação de relatórios em CSV e planilhas, com compartilhamento nativo seguro.

## 3. Design System
- **Paleta e Superfícies:** Tema estrito `true-black-flat` (#000000 para fundos, #111111/#2a2a2a para cards)[cite: 1]. Sem sombras ou elevações excessivas.
- **Tipografia:** Uso obrigatório de `font-variant: ['tabular-nums']` em qualquer dado financeiro, quantidade ou métrica.
- **Iconografia:** Exclusivamente `lucide-react-native`. **Proibido o uso de emojis** em qualquer parte da interface ou código[cite: 1].
- **Cores de Destaque:** Marcação de dados e caixas delimitadoras (bounding boxes) do YOLO utilizam verde-neon (#c6f24e).

## 4. Status Atual de Desenvolvimento
1. **Infraestrutura:** Limite de 260 caracteres do Windows (C++/Ninja) contornado (`C:\Users\ygorg\deteccao-de-objetos\ArmarioDigital` + staging CMake curto). Repositório Git original (`stock-ai`) reconectado e limpo.
2. **Dados e Ciclo de Vida de Imagens (`expo-file-system`):** Banco de Dados SQLite (`armario.db`) configurado com `image_uri` em `spaces` e `items`, Onboarding com `AsyncStorage` funcional e navegação base estruturada. Ciclo de vida completo de imagens implementado com cópia determinística para `documentDirectory/armario_images/` (`persistCapturedImage`), limpeza automática de arquivos órfãos ao atualizar/excluir registros (`deletePersistedImageIfOwned` com proteção contra Path Traversal) e vinculação automática de foto capturada ao bipar SKU existente no modo B2B (`updateItemImage`).
3. **Interoperabilidade B2B (Exportação e Importação CSV / ERP):**
   - **Exportação:** Componente nativo `components/ExportButton.js` (`true-black-flat`, `tabular-nums`) e motor `utils/exportCsv.js` (`expo-sharing`) concluídos, com sanitização RFC 4180 e proteção contra OWASP CSV Formula Injection (`=`, `+`, `-`, `@`).
   - **Importação em Lote (Bulk Upsert):** Motor `utils/importCsv.js` e transação `bulkUpsertItemsFromCatalog` (`database.js`) implementados com suporte a delimitadores `,` e `;` (Excel BR), criação automática de setores/espaços inexistentes, atualização de SKUs existentes preservando `image_uri` e painel de importação nativo na aba Inventário.
   - **Auditoria Operacional de Estoque e Movimentações (Schema v7):** Busca multidimensional (`getItems` por Nome, Código EAN/SKU ou Nome do Local), filtros rápidos de auditoria (`Todos`, `Baixo ≤ 3` e `Ruptura`) e tabela relacional `stock_movements` (Audit Log de Entradas, Baixas, Cadastros e Sincronizações CSV) integrados ao `InventarioScreen`.
4. **Visão Computacional (Edge AI / YOLO):** Adaptador `vision/yoloAdapter.js` e overlay `components/YoloCameraOverlay.js` implementados com decodificação YOLOv8 COCO 80 classes (`[1, 84, 8400]`), inspetor de assinatura binária FlatBuffer `TFL3` (`validateTfliteModelAsset`), diagnóstico visual de status na câmera (`resolveYoloEngineStatus`) e fallback resiliente (`try/catch`) que mantém o scanner óptico e a câmera 100% operacionais caso o binário `.tflite` esteja em modo placeholder.
5. **Próximo Marco Arquitetural:** Substituir o arquivo placeholder `assets/models/yolov8n.tflite` pelo binário YOLOv8n quantizado (Float16/Int8) real para validação em dispositivo físico via `npx expo run:android`, e implementar edição rápida de item/localização diretamente no card do Inventário.

## 5. Regras de Engajamento para Agentes de IA
Qualquer IA ou agente autônomo (como Roo Code / Cline) operando neste repositório DEVE seguir estritamente as regras abaixo:
1. **Vertical Slicing:** Desenvolver uma funcionalidade completa (DB -> Lógica -> UI) antes de iniciar a próxima.
2. **Test-Driven & Linting:** Validar regras de Design System e criar testes unitários (Node nativo) antes de implementar lógica complexa de negócios ou banco de dados. Nunca utilizar comandos destrutivos (ex: `DROP TABLE`) em produção.
3. **Autonomia Segura:** O agente deve operar continuamente, pedindo aprovação humana **apenas** em Checkpoints arquiteturais (fim de uma funcionalidade), decisões irreversíveis de banco de dados, ou necessidade de teste físico no aparelho (ex: Câmera/Scanner).