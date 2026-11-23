# TERRY

O amigo de filmagem de quem cria vídeo curto. Você conta o que vai gravar e mostra de 1 a 3 vídeos de referência. O TERRY reconhece o tipo de conteúdo (gastronomia, beleza e maquiagem, review de produto, marketing e marca, política e opinião, tutorial, vlog, fitness, humor), entende o estilo, sugere um roteiro original dividido em tomadas, guarda cada clipe no lugar certo e entrega um primeiro corte vertical (MP4 1080×1920), com legendas opcionais, pronto para exportar.

- **App:** Expo SDK 58 / React Native 0.88 / TypeScript, Expo Router, iOS e Android.
- **Vídeo:** módulo nativo próprio (`modules/terry-media`), com AVFoundation no iOS e Media3 Transformer 1.9.1 no Android. Analisa, monta e exporta tudo no aparelho.
- **IA (opcional):** backend Node (`server/`) que guarda a chave da Anthropic e usa o `claude-opus-5-5`. Os vídeos não saem do celular: o backend recebe só 8 quadros JPEG pequenos por referência e as medidas feitas no aparelho.

---

## Simulador no computador

O TERRY também roda no navegador, dentro de uma moldura de celular. Isso serve para ver as telas e percorrer o fluxo sem instalar nada.

- **Online:** https://rafaelghida-arch.github.io/terry/ (publicado pelo workflow `Simulador web`; é preciso ativar uma vez em *Settings → Pages → Source: GitHub Actions*).
- **Local:**

```bash
npx expo start --web
```

Funciona no simulador: projetos, referências escolhidas do computador (com análise de ritmo e som feita no navegador), roteiro, tomadas com a Galeria ou o Clipe exemplo, editor, Aparar e Enquadrar. Só funcionam no celular: câmera, narração e exportação do MP4. No simulador, os rascunhos ficam no navegador e os vídeos escolhidos não sobrevivem a um recarregamento da página.

## Testar no celular

O TERRY usa código nativo, então **não roda no Expo Go**. É preciso um *development build*, instalado uma vez. Depois disso, as mudanças de JavaScript chegam por recarregamento rápido.

### 1. Instalar

```bash
npm install
```

```bash
npm --prefix server install
```

### 2. Gerar o app (escolha um caminho)

**A) Na nuvem, com EAS. Não precisa de Xcode nem de Android Studio.**

```bash
npx eas-cli@latest login
```

```bash
npx eas-cli@latest build --profile development --platform android
```

```bash
npx eas-cli@latest build --profile development --platform ios
```

No Android, o EAS entrega um link de APK para instalar. No iOS, o aparelho precisa estar registrado (`npx eas-cli@latest device:create`) e é necessária uma conta Apple Developer.

**B) Localmente, com o celular no cabo:**

```bash
npx expo run:android --device
```

```bash
npx expo run:ios --device
```

(Requer Android Studio com o Android SDK no Android, e Xcode com CocoaPods no iOS, nas versões exigidas pelo Expo SDK 58.)

### 3. Abrir

```bash
npx expo start --dev-client
```

Abra o app TERRY instalado e escaneie o QR code (o celular e o computador precisam estar na mesma rede Wi‑Fi).

### 4. Ligar a análise por IA (opcional)

Sem chave configurada, o app funciona assim:
- **Projeto de demonstração** (“Abrir demonstração”, na tela inicial): análise e roteiro de exemplo, identificados como demonstração. Com ele dá para gravar, escolher da galeria ou usar os dois **clipes de exemplo** embutidos (um vertical, um horizontal), montar e exportar.
- **Projetos reais:** o TERRY mede no aparelho o ritmo dos cortes, quando a voz entra e quanto som ambiente existe, e avisa na tela: “A análise por IA não está ligada neste aparelho…”. O roteiro aparece como “roteiro base, sem IA”.

Para ligar a IA:

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run server
```

Depois crie um `.env` na raiz do projeto, a partir do `.env.example`, com o IP do computador na rede:

```bash
cp .env.example .env
```

```
EXPO_PUBLIC_TERRY_API_URL=http://192.168.0.10:8787
```

Reinicie o `npx expo start --dev-client`. Para usar fora da rede local, publique o `server/` em qualquer host Node e defina `TERRY_APP_TOKEN` no servidor e `EXPO_PUBLIC_TERRY_APP_TOKEN` no app.

Variáveis do servidor: `ANTHROPIC_API_KEY` (obrigatória para a IA), `PORT` (padrão 8787), `TERRY_MODEL` (padrão `claude-opus-5-5`) e `TERRY_APP_TOKEN` (opcional).

---

## Roteiro de teste no aparelho

1. **Prova técnica da exportação:** abra “Abrir demonstração” → escolha um gancho → “Aprovar roteiro”. Em duas tomadas, toque em “Clipe exemplo” (ou “Escolher da galeria”) → “Montar vídeo” → “Montar sem” → “Exportar”. Depois, “Salvar na galeria”, e abra o vídeo no app Fotos/Galeria: ele precisa tocar com imagem e som.
2. **Enquadrar:** no editor, selecione o clipe horizontal (“EXEMPLO HORIZONTAL”), toque em “Enquadrar” e arraste a janela para um lado. A prévia e o MP4 exportado devem mostrar o mesmo recorte.
3. **Gravar por tomada:** no cartão de uma tomada, “Gravar agora” mostra a instrução acima da câmera. Grave a tomada 4 antes da 1. Ao voltar, a miniatura aparece no cartão certo e a próxima tomada vazia fica selecionada.
4. **Persistência:** grave e bloqueie a tela no meio. A gravação para e o clipe é salvo. Feche o app à força, abra de novo e o projeto continua igual.
5. **Reordenar:** use “Subir/Descer” numa cena com clipe. O clipe vai junto, e a ordem da montagem acompanha.
6. **Aparar:** com um clipe longo (mais de 1,5× a duração sugerida), o TERRY já sugere um trecho. Abra “Aparar” e ajuste as duas alças. O original não muda.
7. **Narração:** crie um projeto com “Narração” → editor → “Narração” → grave por cima da prévia → em “Áudio”, ajuste o volume dos clipes → exporte.
8. **Falha na exportação:** “Cancelar” durante a exportação mostra “Tentar de novo”, e a edição continua intacta.
9. **IA:** com o servidor ligado, use 2 TikToks salvos com estilos diferentes. Deve aparecer “Essas referências puxam pra lados diferentes. Qual tem mais a sua cara?”. Escolha uma e confira se a primeira tomada do roteiro muda conforme a referência escolhida.

---

## Tipos de conteúdo

Cada gênero tem seus ganchos, tomadas, dicas de gravação e regras de conteúdo (`src/domain/genres.ts`). Exemplos:

- **Review:** abre com a pergunta segurando o produto, ou abrindo a caixa. Tem tomada de uso real, um teste que qualquer pessoa entende e o veredito do criador, sem texto escrito.
- **Política e opinião:** abre com a pergunta central ou com o documento. Separa fato de opinião, mostra a fonte na tela e apresenta o outro lado. O TERRY nunca escreve a posição do criador.
- **Marketing:** abre com o problema do cliente ou com o produto em destaque. Mostra uma prova real e termina com uma chamada para ação, com a oferta escrita exatamente como no briefing.
- **Beleza:** abre com o resultado pronto ou com o antes e depois na mesma luz. Mostra os produtos, depois o passo que mais dá errado.

O gênero vem do briefing: o TERRY sugere um enquanto você digita, e você pode trocar. Com a IA ligada, ele também lê o gênero das referências e avisa quando elas parecem de outro tipo.

## Roteiro que segue as referências

O roteiro espelha a referência principal, plano a plano. O TERRY mede no aparelho quantos planos ela tem, quanto dura cada um e em quais há fala, e o roteiro sai com o mesmo número de tomadas (na proporção da duração escolhida), a fala nos mesmos lugares e a mesma abertura. Os modelos de cada gênero só preenchem o conteúdo de cada tomada, e o cartão do gancho mostra de onde veio (“Segue a referência: 6 planos de ~2 s, 3 com fala, abrindo sem fala.”). Com a IA ligada, ela também descreve o enquadramento e a função de cada plano, e o roteiro segue isso.

Em **Outro**, o TERRY não força um gênero: usa o que as referências mostram.

## Editor: só o que as referências têm

Na primeira montagem, o editor começa com o visual das referências e nada além disso:

- **Legenda:** só vem ligada se as referências têm legenda, na mesma cor e posição.
- **Zoom:** só entra se as referências usam zoom, no mesmo estilo (aproximação suave ou corte mais perto).
- **Trilha:** nunca entra sozinha. O vídeo sai com o som real. Dá para escolher uma das três trilhas originais do app (compostas para o TERRY, sem direitos de terceiros) ou uma música do celular, e tirar com “Sem trilha”.

Sem referência que justifique, o corte sai limpo, sem efeitos.

## Legendas

Em **Legendas → Mostrar legendas**, o TERRY ouve **todos os takes** e transcreve a fala no próprio aparelho: reconhecimento de fala da Apple no iOS, reconhecedor do sistema no Android 13+. Quando não dá para transcrever, usa a fala do roteiro. Takes sem fala aparecem na lista para você escrever.

A lista é organizada por take. Toque no texto para corrigir. Cor: branco ou até 3 cores tiradas dos seus vídeos. Estilo: contorno ou faixa. Posição: embaixo ou no meio. O mesmo estilo vale para todos os takes. As legendas aparecem na prévia e saem gravadas no MP4.

## Pra postar

Na exportação, o TERRY sugere:

- 3 hashtags conhecidas do nicho (sem #fyp nem #viral);
- um título e uma descrição feitos só com os fatos do briefing;
- uma recomendação de trilha para colocar na hora de publicar, com o tipo de som e o termo para buscar nos sons do TikTok ou do Instagram.

Tudo pode ser copiado. Ele não cita músicas “em alta”, porque isso muda toda semana.

## Como funciona

```
src/
  app/                  telas (Expo Router)
    index.tsx           Início: “TERRY”, Novo projeto, projetos com capa real e duração
    new.tsx             “O que tu vai gravar hoje?”, duração 15/30/60, modos de áudio
    p/[id]/refs.tsx     referências (1–3 vídeos da galeria: miniatura, duração, remover)
    p/[id]/style.tsx    análise: observações editáveis, escolha da referência principal
    p/[id]/hooks.tsx    duas opções de gancho, cada uma com a primeira tomada diferente
    p/[id]/script.tsx   roteiro/tomadas: cartões, progresso, gravar/galeria/assistir/aparar,
                        editar/reordenar/regenerar/excluir/montar sem
    p/[id]/record.tsx   câmera: instrução acima, dica do TERRY, controles embaixo
    p/[id]/editor.tsx   prévia 9:16 fiel ao recorte, faixa de clipes, Aparar/Enquadrar/Áudio/Narração
    p/[id]/export.tsx   progresso, salvar na galeria, compartilhar, tentar de novo
  domain/               lógica pura e testada
    timeline.ts         montagem, recorte 9:16, sugestão de trecho, especificação de exportação
    style.ts            cortes a partir dos quadros, voz × som ambiente, observações verdadeiras
    scriptLocal.ts      roteiro base sem IA (também usado na demonstração)
    brief.ts            fatos do briefing (prato, preço, lugar, intenções)
    terry.ts            a voz do TERRY
  services/             ponte com o nativo, backend e fluxos
  state/ storage/       rascunho salvo no aparelho (JSON + mídia na pasta do projeto)
modules/terry-media/    módulo nativo (Swift + Kotlin)
server/                 backend de IA (Node + @anthropic-ai/sdk)
```

**Análise de estilo.** O módulo nativo amostra 4 quadros por segundo em 16×16 px e mede a diferença entre eles para achar os cortes. Também decodifica o áudio para PCM, calcula o volume e a taxa de cruzamentos por zero a cada 0,1 s e salva 8 quadros-chave de até 512 px. No aparelho, o app estima onde a voz entra e quanto do tempo é som ambiente. Com a IA ligada, os quadros e as medidas vão para o Claude, que diz como o vídeo abre, se a comida aparece antes da fala, se há rosto para a câmera e como termina. A análise fica guardada no projeto e só é refeita quando as referências mudam.

**Regras de conteúdo.** Os fatos vêm só do briefing e as referências só definem a linguagem. A tomada da mordida não leva fala escrita. O app não aplica zoom automático, transições, trilha nem legendas. A frase “Nos dois vídeos, a comida aparece antes de alguém falar…” só aparece quando isso é verdade em todas as referências, conferido no código (`terryLineFor`).

**Montagem.** Os clipes entram na ordem aprovada, com cortes secos e o recorte 9:16 de cada clipe. A trilha original é mantida, com volume ajustável, e a narração entra em uma segunda trilha. Os clipes são cópias dentro da pasta do projeto, então os originais da galeria nunca mudam.

## Custos variáveis da IA

Preço do `claude-opus-5-5`: US$ 4 por milhão de tokens de entrada e US$ 20 por milhão de saída. O servidor registra no log o custo de cada chamada.

| Chamada | Quando | Estimativa |
|---|---|---|
| Análise (`/v1/analyze`) | uma vez por conjunto de referências | ~6–16 mil tokens de entrada (8 quadros × até 3 vídeos) + ~1,5 mil de saída → **US$ 0,05–0,10** |
| Roteiro (`/v1/script`) | “Criar roteiro” / “Gerar outras opções” | ~2 mil de entrada + ~3 mil de saída → **~US$ 0,07** |
| Regenerar cena (`/v1/scene`) | “Outra versão” | ~1,5 mil + ~0,4 mil → **~US$ 0,015** |

Um projeto típico custa **US$ 0,15–0,25**. O servidor usa o fallback de recusa do lado do servidor (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`). Se o modelo recusar um pedido, outro modelo tenta automaticamente. Para economizar, defina `TERRY_MODEL=claude-sonnet-5-5`.

## Verificação

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm --prefix server test
```

## Limitações conhecidas

- **Importação por link** (URL do TikTok) não foi implementada. O fluxo principal usa arquivos salvos na galeria, como pedido.
- **Transcrição** não é feita. A análise de áudio usa o envelope de volume e a taxa de cruzamentos por zero, que é uma estimativa (fala × chiado). Com a IA ligada, os quadros confirmam rosto e comida.
- **Prévia do editor:** troca de clipe num único player, então pode haver uma pausa curta entre cortes na prévia. O MP4 exportado não tem essa pausa.
- **Transcrição:** depende do reconhecedor de fala do aparelho. No Android, precisa do Android 13 ou mais novo e de um serviço de reconhecimento que aceite arquivo de áudio. Sem isso, as legendas vêm do roteiro e você corrige. No simulador não há transcrição.
