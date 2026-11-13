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
1. **Infraestrutura:** Limite de 260 caracteres do Windows (C++/Ninja) contornado. Repositório Git original (`stock-ai`) reconectado e limpo.
2. **Dados:** Banco de Dados configurado com `image_uri` para suportar fotos[cite: 1], Onboarding com `AsyncStorage` funcional[cite: 1], navegação base estruturada[cite: 1].
3. **Próximo Marco:** Finalizar o fluxo B2B do `expo-file-system` (captura e armazenamento persistente de imagens das mercadorias) e estruturar a exportação B2B de planilhas/CSV, preparando o terreno para o adaptador YOLO local.

## 5. Regras de Engajamento para Agentes de IA
Qualquer IA ou agente autônomo (como Roo Code / Cline) operando neste repositório DEVE seguir estritamente as regras abaixo:
1. **Vertical Slicing:** Desenvolver uma funcionalidade completa (DB -> Lógica -> UI) antes de iniciar a próxima.
2. **Test-Driven & Linting:** Validar regras de Design System e criar testes unitários (Node nativo) antes de implementar lógica complexa de negócios ou banco de dados. Nunca utilizar comandos destrutivos (ex: `DROP TABLE`) em produção.
3. **Autonomia Segura:** O agente deve operar continuamente, pedindo aprovação humana **apenas** em Checkpoints arquiteturais (fim de uma funcionalidade), decisões irreversíveis de banco de dados, ou necessidade de teste físico no aparelho (ex: Câmera/Scanner).