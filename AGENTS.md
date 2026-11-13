# AGENTS.md — Diretrizes de Arquitetura e Engenharia (Armário Digital)

Este documento define as regras obrigatórias de engenharia de software, arquitetura mobile (Expo / React Native) e controle de qualidade para agentes de IA que atuam neste repositório. Todas as futuras respostas e implementações neste projeto **devem** seguir estritamente estas diretrizes.

---

## 1. Modelo de Execução Orientado a Skills (`skills-lock.json`)

As skills ativas do projeto estão instaladas em `.agents/skills/<skill-name>/SKILL.md` e registradas em [`skills-lock.json`](./skills-lock.json):

| Skill | Origem | Escopo de Ativação |
| :--- | :--- | :--- |
| **`planning-and-task-breakdown`** | `addyosmani/agent-skills` | Decomposição de funcionalidades, arquitetura de tarefas, fatiamento vertical (*Vertical Slicing*) e checkpoints de verificação. |
| **`test-driven-development`** | `addyosmani/agent-skills` | Ciclo **Red → Green → Refactor**, padrão *Prove-It* para correção de bugs e testes orientados a estado. |
| **`code-review-and-quality`** | `addyosmani/agent-skills` | Revisão obrigatória em 5 eixos (Corretude, Legibilidade, Arquitetura, Segurança e Performance), higiene de código morto e disciplina de dependências. |
| **`design-taste-frontend`** | `Leonxlnx/taste-skill` | Design System `true-black-flat` (`#000000` / `#111111`), zero emojis no código, ícones vetoriais Lucide e `tabular-nums`. |

### Ciclo de Vida Implícito por Tarefa
Para qualquer solicitação de engenharia no projeto, aplique internamente o fluxo:
1. **PLAN (`planning-and-task-breakdown`):** Analisar impacto, dependências e fatiar o trabalho antes de editar arquivos.
2. **BUILD & TEST (`test-driven-development` + `design-taste-frontend`):** Implementar em fatias pequenas, guiado por testes/verificações e respeitando os tokens visuais.
3. **REVIEW (`code-review-and-quality`):** Executar a revisão nos 5 eixos e rodar os linters/verificadores antes de declarar a tarefa concluída.

---

## 2. Planejamento e Decomposição de Tarefas (`planning-and-task-breakdown`)

Documentação completa em [`.agents/skills/planning-and-task-breakdown/SKILL.md`](./.agents/skills/planning-and-task-breakdown/SKILL.md).

1. **Modo Planejamento (*Read-Only First*):**
   * Antes de escrever código em tarefas com múltiplos passos, inspecione os arquivos afetados, identifique padrões existentes e mapeie o grafo de dependências de baixo para cima (*bottom-up*: Schema SQLite em `database.js` → Funções de acesso a dados → Estado/Contexto → Componentes de UI em `App.js`).
2. **Fatiamento Vertical (*Vertical Slicing*):**
   * Construa um caminho de funcionalidade completo e testável por vez (banco + lógica + UI daquela feature) em vez de construir camadas horizontais isoladas sem conexão.
3. **Dimensionamento de Tarefas (*Task Sizing*):**
   * Mantenha tarefas nos tamanhos **XS** (1 arquivo), **S** (1–2 arquivos) ou **M** (3–5 arquivos).
   * Se uma tarefa tocar mais de 5 arquivos (**L/XL**), envolver dois subsistemas independentes ou tiver "e" conectando objetivos distintos no título, quebre-a em subtarefas menores.
4. **Critérios de Aceite, Checkpoints e Proteção de Estado:**
   * Toda tarefa deve ter **Critérios de Aceite** explícitos e **Passos de Verificação** (testes, lint, checagem de sintaxe e validação funcional).
   * Insira checkpoints de verificação a cada 2–3 tarefas, garantindo que o app permaneça sempre em estado funcional.
   * **Nunca sobrescreva um plano incompleto:** Antes de gravar `tasks/plan.md` ou `tasks/todo.md`, verifique se já existem tarefas em aberto de outro trabalho; em caso de conflito, pare e pergunte ao usuário.

---

## 3. Desenvolvimento Orientado a Testes — TDD (`test-driven-development`)

Documentação completa em [`.agents/skills/test-driven-development/SKILL.md`](./.agents/skills/test-driven-development/SKILL.md).

1. **Descubra a Stack Primeiro (*Discover the Stack First*):**
   * Nunca assuma comandos genéricos sem verificar `package.json`, scripts locais e ferramentas de validação do repositório.
2. **O Ciclo TDD (`RED → GREEN → REFACTOR`):**
   * **RED:** Escreva um teste ou verificação reproduzível que falhe para o comportamento desejado.
   * **GREEN:** Escreva a implementação mínima necessária para satisfazer o requisito sem *over-engineering*.
   * **REFACTOR:** Limpe duplicações, melhore nomes e extraia funções auxiliares mantendo todas as verificações verdes.
3. **Padrão *Prove-It* para Correção de Bugs:**
   * Ao receber um relato de bug, **não comece tentando adivinhar o conserto**. Primeiro reproduza o bug com um teste/cenário que falhe, aplique a correção e comprove que a falha desapareceu sem introduzir regressões.
4. **Princípios para Bons Testes:**
   * **Teste Estado, Não Interações (*Test State, Not Interactions*):** Valide o resultado final da operação (ex.: dados persistidos/retornados ou estado visível) em vez de acoplar testes a chamadas internas de implementação.
   * **DAMP sobre DRY em Testes:** Cada teste deve ser descritivo, autocontido e fácil de ler como uma especificação, seguindo a estrutura *Arrange-Act-Assert* e validando um conceito por teste.
   * **Prefira Implementações Reais a Mocks:** Ordem de preferência: `Implementação Real > Fake (ex.: SQLite em memória) > Stub > Mock`. Use mocks apenas em fronteiras lentas ou não-determinísticas (câmera física, hardware externo).
   * **Sem Re-execuções Redundantes:** Após uma execução limpa dos testes/verificadores, não repita o mesmo comando sem que o código tenha sido alterado.

---

## 4. Revisão de Código e Qualidade (`code-review-and-quality`)

Documentação completa em [`.agents/skills/code-review-and-quality/SKILL.md`](./.agents/skills/code-review-and-quality/SKILL.md).

Toda alteração deve passar pela **Revisão em 5 Eixos (Five-Axis Review)** antes de ser entregue:

### Eixo 1: Correctness (Corretude)
* O código cumpre exatamente os requisitos da tarefa?
* Casos de borda (`null`, `undefined`, strings vazias, quantidades zero/negativas) e caminhos de erro (`try/catch` em operações SQLite, `AsyncStorage` e `CameraView`) estão tratados?
* Não há condições de corrida (*race conditions*), como leituras duplicadas de código de barras ou dessincronização no *Optimistic UI*?

### Eixo 2: Readability & Simplicity (Legibilidade e Simplicidade)
* Nomes de variáveis, funções e estilos são claros e consistentes com o domínio do projeto?
* O fluxo de controle é direto (sem ternários profundamente aninhados ou ramificações coladas em fluxos não relacionados)?
* **Higiene de Código Morto (*Dead Code Hygiene*):** Após refatorações, identifique variáveis, funções, estilos ou imports órfãos. Liste-os explicitamente e pergunte ao usuário antes de deletar código cuja utilidade futura seja incerta.

### Eixo 3: Architecture (Arquitetura e Tamanho de Mudança)
* Respeita a separação de responsabilidades (persistência SQLite isolada em `database.js`, contexto de perfil em `ProfileContext`, componentes visuais desacoplados)?
* **Redução Real de Complexidade:** Uma refatoração deve reduzir o número de conceitos que o leitor precisa manter na cabeça (eliminando ramificações desnecessárias), e não apenas mover complexidade de lugar.
* **Controle de Tamanho de Arquivo e Diff:** Priorize mudanças enxutas (~100–300 linhas). Quando um arquivo crescer excessivamente (~1000+ linhas), proponha decompor subcomponentes ou módulos antes de continuar acumulando responsabilidades. Separe refatorações estruturais de novas features quando possível.

### Eixo 4: Security (Segurança)
* **SQL Parametrizado:** Todas as queries em `database.js` devem usar *placeholders* parametrizados (`?`), nunca interpolação direta de strings do usuário.
* **Validação de Fronteira:** Entradas de texto, códigos de barras escaneados e URIs de mídia devem ser sanitizados e validados antes de persistência ou renderização.
* **Zero Segredos:** Nenhuma chave, credencial ou caminho sensível deve ser exposto em código ou logs.

### Eixo 5: Performance (Desempenho Mobile)
* **Zero N+1 Queries:** Utilize `LEFT JOIN` e agregações SQL em uma única consulta (como em `getItems` e `getSpaces`).
* **Renderização Otimizada:** Em `FlatList`, mantenha `keyExtractor={(item) => String(item.id)}` estrito e aplique **Optimistic UI Updates** (`setItems` imediato + persistência em background com *rollback* em caso de erro) para evitar *flickering*.

### Categorização de Apontamentos e Disciplina de Dependências
* Ao revisar código ou reportar problemas, rotule a severidade:
  * **`Critical:`** Bloqueante imediato (vulnerabilidade, perda de dados, quebra funcional).
  * *(Sem prefixo / Required):* Correção obrigatória antes de concluir.
  * **`Optional:` / `Consider:`** Sugestão de melhoria arquitetural não bloqueante.
  * **`Nit:`** Detalhe menor de estilo/formatação.
  * **`FYI:`** Contexto informativo.
* **Disciplina de Dependências:** Toda nova dependência é um passivo. Verifique se o SDK do Expo ou a biblioteca padrão já resolvem o problema. Sempre instale pacotes compatíveis via `npx expo install <pacote>`, uma dependência lógica por vez, revisando impactos no `package-lock.json`.

---

## 5. Diretrizes Específicas Expo / React Native & Design System

### Expo & React Native
1. **Verifique a versão do SDK em `package.json`** antes de utilizar APIs do ecossistema Expo/React Native (consulte `https://docs.expo.dev/llms.txt` em caso de dúvida sobre APIs recentes).
2. **Comandos do Projeto:**
   ```bash
   npx expo install <package>  # SEMPRE use em vez de npm/yarn add para garantir versões compatíveis com o SDK
   npx expo start              # Inicia o servidor de desenvolvimento
   node --check database.js    # Validação rápida de sintaxe JS
   node .agents/skills/design-taste-frontend/scripts/lint.mjs --app App.js  # Linter obrigatório de Design System
   ```
3. **Continuous Native Generation (CNG):** Se os diretórios `ios/` e `android/` não existirem, nunca os crie manualmente; configure permissões e plugins nativos via `app.json`.

### Design System `true-black-flat` (`design-taste-frontend`)
* **Elevação por Luminosidade:** Ground `#000000` → Surface `#111111` → Raised `#2a2a2a` (sem sombras artificiais ou bordas decorativas em cards; divisores internos restritos a hairlines `1px` `#161616`).
* **Ações Primárias por Inversão:** Pílula branca (`#ffffff`) com texto preto (`#000000`).
* **Cor de Destaque (`#c6f24e`):** Restrita às marcas de dados (quantidades em estoque, KPIs e códigos lidos).
* **Zero Emojis na UI:** Proibido o uso de emojis no código-fonte de interface; utilize exclusivamente ícones vetoriais SVG da biblioteca `lucide-react-native` e `fontVariant: ['tabular-nums']` em todos os contadores numéricos.
