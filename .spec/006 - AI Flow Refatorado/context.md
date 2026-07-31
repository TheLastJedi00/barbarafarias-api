# Especificação Funcional: Geração Granular e Monitoramento de Material

## 1. Visão Geral e Objetivo

O sistema deve abandonar a geração monolítica de conteúdo e adotar uma arquitetura de geração granular e paralela. O objetivo é reduzir drasticamente o tempo de espera do usuário, mitigar falhas totais por timeout e fornecer feedback visual em tempo real sobre o progresso de cada unidade pedagógica (tópico) sendo gerada.

## 2. Requisitos de Interface (UI/UX)

### 2.1. Tela Dedicada de Monitoramento

* **Contexto:** Devido à abordagem *mobile-first* e à densidade de informações, a geração de material não deve ocorrer em um modal ou pop-up.
* **Comportamento:** Ao iniciar a geração, o usuário (Teacher) deve ser navegado para uma tela exclusiva de "Monitoramento de Geração".
* **Estrutura Visual:** A tela deve exibir a hierarquia completa do material que está sendo construído, agrupando os Tópicos dentro de seus respectivos Módulos.

### 2.2. Componente de Status do Tópico

Cada tópico a ser gerado deve ser representado na interface por um componente visual independente. Este componente é o ator principal da tela de monitoramento e deve refletir exclusivamente o seu próprio ciclo de vida.

* **Restrição de Design:** O uso de emojis é estritamente proibido. Toda a comunicação visual de estado deve ser feita através de ícones vetoriais (SVG) para garantir consistência em qualquer sistema operacional.

## 3. Máquina de Estados do Tópico

O componente de tópico deve transitar entre os seguintes quatro estados:

| Estado | Descrição do Comportamento | Representação Visual (SVG) |
| :--- | :--- | :--- |
| **Aguardando Criação** | O tópico está na fila ou a requisição global foi iniciada, mas o processamento deste nó específico ainda não começou ou não retornou status. | SVG de um relógio estático ou círculo tracejado em cor neutra (ex: cinza). |
| **Criando** | O processamento do tópico está em andamento. A requisição para a IA foi despachada. | SVG de um *spinner* circular com animação de rotação contínua (ex: azul ou cor primária da marca). |
| **Concluído** | A IA retornou o conteúdo com sucesso e o schema foi validado. | SVG de um sinal de visto (checkmark) sólido (ex: verde). |
| **Falha** | Ocorreu um erro na geração (timeout, erro da IA, ou falha de validação do formato). | SVG de um sinal de alerta ou um "X" (ex: vermelho). |

## 4. Regras de Negócio e Comportamento

### 4.1. Independência de Processamento

A falha na geração de um Tópico "A" não deve interromper, cancelar ou invalidar a geração do Tópico "B". Cada nó da árvore de conteúdo é isolado.

### 4.2. Mecanismo de Recuperação (Retry Granular)

* Quando um tópico atingir o estado de **Falha**, o componente correspondente deve habilitar uma ação (botão/link) de "Tentar Novamente".
* O acionamento desta ação deve reiniciar o ciclo de vida **apenas** daquele tópico específico, transitando-o de volta para o estado **Criando**, sem afetar os tópicos que já estão no estado **Concluído**.

### 4.3. Conclusão do Processo Global

* O material de estudo só será considerado finalizado e pronto para consumo do aluno quando **todos** os componentes de tópico listados na tela atingirem o estado **Concluído**.
* Ao atingir 100% de conclusão, a interface deve liberar a navegação (um botão de "Acessar Material" ou redirecionamento automático) e o backend deve consolidar os dados para persistência definitiva.

## 5. Requisitos de Integração (Contrato Cliente-Servidor)

Para que a interface consiga representar esses estados fielmente, a comunicação entre o cliente e o servidor deve suportar:

1. **Leitura da Estrutura:** Antes de iniciar a geração com a IA, o cliente precisa receber do servidor a "planta baixa" (esqueleto) do curso (Quais são os módulos e quais tópicos pertencem a eles) para renderizar a tela de monitoramento no estado *Aguardando*.
2. **Atualização Granular:** O cliente deve ser capaz de despachar comandos de geração individualizados por tópico ou receber eventos do servidor (via WebSockets/SSE) informando a mudança de estado de cada ID de tópico em tempo real.
3. **Consolidação:** Uma vez que o cliente reconhece que todos os nós estão concluídos, deve haver um sinal (ou chamada final) para que o servidor empacote esses tópicos no formato de entrega final para o aluno.