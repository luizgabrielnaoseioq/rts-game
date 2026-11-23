# Cinzas de Vharos — GDD do MVP

> Versão 0.1 (MVP) · jogo de estratégia multiplayer persistente no navegador · 10 a 50 jogadores num único mundo · desktop primeiro.
> Todos os números deste documento viram config em `packages/shared/src/config/*.ts`. Fórmulas vêm primeiro; as tabelas são o resultado delas (arredondado com `Math.round`, salvo quando indicado).

---

## 1. Ficha rápida

| Item | Decisão |
|---|---|
| Nome | **Cinzas de Vharos** (id do projeto: `ashes-of-vharos`) |
| Gênero | Estratégia 4X leve / MMO-strategy (cidade + mapa + marchas) |
| Mundo | 1 mundo, grade 120×120, 3 biomas por latitude |
| Jogadores | 10 a 50, todos no mesmo mundo, sem alianças no MVP |
| Sessão-alvo | 20 a 90 min ativa; o jogo segue produzindo offline |
| Ritmo | Upgrades de 6 s a ~6 min; marchas de 10 s a ~3 min; multiplicador global no config |
| Servidor | Autoritativo (NestJS). Cliente só pede ações e desenha o estado |
| Aleatoriedade | Combate 100% determinístico. Sorteio só em baús, taverna e geração do mapa (com seed) |

---

## 2. Premissa e lore

Há trezentos invernos, o Sol de Vharos rachou. Na noite da **Fenda**, a luz caiu em pedaços sobre o mundo e o céu ficou cor de ferrugem.

O frio desceu dos polos e trouxe a **Hoste Pálida**: cavaleiros mortos que marcham dentro do gelo e não esquecem quem foram. Entre os polos e o meio do mundo, a luz que restou queimou a terra até virar sal; ali a **Seita Salobra** seca os vivos para que durem para sempre. Só nos Vales, ao redor do equador, ainda há chuva, trigo e fogo bom.

O fogo é a lei. Cada vila mantém um **Braseiro**, uma chama acesa desde a Fenda. Quem deixa a chama morrer vira **Oco**: gente que continua andando, comendo e matando, mas sem nada dentro.

As Casas que juraram manter as chamas formam o **Juramento do Braseiro**. Você governa uma dessas Casas. Erga muralhas, treine lanças, procure ouro nos ermos e marche para o gelo, onde dizem que os pedaços do Sol ainda brilham. As outras Casas também querem esses pedaços. O Juramento proíbe apagar a chama de um irmão. Não proíbe roubar a lenha dele.

### 2.1 Facção do jogador

| id | Nome | Descrição |
|---|---|---|
| `ember_oath` | Juramento do Braseiro | Casas humanas que guardam as últimas chamas. Cada jogador é uma Casa com uma cidade (Forte de Brasa). Estética: ferro escuro, couro, estandartes vermelho-brasa. |

### 2.2 Inimigos NPC

| id | Nome | Bioma | Níveis | Visual | Composição |
|---|---|---|---|---|---|
| `npc_hollow` | Os Ocos | Vales (verde) | 1–3 | Silhuetas cinzentas, olhos apagados, foices | 60% infantaria, 40% arqueiros |
| `npc_brine` | Seita Salobra | Ermos de Sal (deserto) | 4–7 | Corpos secos em faixas, crostas de sal, camelos-ossos | 40% cavalaria, 30% infantaria, 30% arqueiros |
| `npc_pale` | Hoste Pálida | Coroa Gélida (polos) | 8–10 | Armaduras congeladas, luz azul fria | 50% infantaria, 30% cavalaria, 20% arqueiros; +10% DEF e +10% VIDA |

### 2.3 Heróis (resumo; números na seção 9)

| id | Nome | Título | Raridade | Papel |
|---|---|---|---|---|
| `hero_aldric` | Aldric Varn | o Último Escudo | Comum | Infantaria / defesa |
| `hero_dorrik` | Dorrik Pá-Torta | o Farejador de Veios | Comum | Coleta |
| `hero_seris` | Seris Malvane | a Mira de Cinza | Raro | Arqueiros |
| `hero_brannoc` | Brannoc Hal | o Corvo de Estrada | Raro | Cavalaria / velocidade |
| `hero_ysolde` | Madre Ysolde | a Vela Negra | Épico | Sustento (feridos) |
| `hero_vesna` | Vesna Korr | a Ceifadora Pálida | Épico | Ataque / saque |

---

## 3. Loop principal

**Minuto a minuto (o que o jogador faz na tela)**
1. Coleta a produção e confere a fila de obra (6 s a 6 min).
2. Manda tropas treinarem no Quartel (1,5 s a 6 s por unidade).
3. Despacha marchas: coletar um nó perto, atacar um acampamento do nível certo.
4. Vê o relatório de batalha que chega em 10 s a 3 min, abre o baú, cura os feridos.
5. Usa o que ganhou para o próximo upgrade. Repete.

**Sessão (20 a 90 min)**
- Subir 1 nível da Cidadela (no início, vários por sessão).
- Limpar os acampamentos do seu bioma e empurrar 1 nível de acampamento a mais.
- Deixar todas as marchas coletando antes de sair (produção offline + coleta rendem enquanto está fora).
- Olhar o mapa: quem está perto, quem cresceu, quem está sem escudo.

**Dia**
- Abrir o baú diário (Oferenda do Braseiro) e usar o chamado grátis da taverna (reset 00:00, America/Sao_Paulo).
- Liberar um herói novo por fragmentos, trocar o comandante de defesa.
- Expedição ao deserto/gelo atrás de baús melhores e nós ricos.
- PvP entre amigos: saquear quem deixou recurso sobrando e tropa fora.

---

## 4. Configuração global (`speed.ts`)

| Chave | Padrão | Efeito |
|---|---|---|
| `GAME_SPEED` | `1` | Divide todos os timers: obra, treino, cura, viagem de marcha, duração de coleta, respawn. `2` = tudo na metade do tempo. |
| `ECONOMY_SPEED` | `1` | Multiplica produção passiva e velocidade de coleta. |
| `SHIELD_USES_GAME_SPEED` | `false` | Escudos contam em tempo real (protege quem está offline). |
| `MIN_MARCH_SECONDS` | `10` | Marcha nunca leva menos que isso (depois do `GAME_SPEED`). |
| `DAILY_RESET_TZ` | `America/Sao_Paulo` | Reset do baú diário e do chamado grátis às 00:00. |
| `WORLD_SEED` | string | Seed da geração do mapa. |

Regra de implementação: todo timer é salvo como `endsAt` absoluto no servidor; o cliente só faz a contagem regressiva. Produção é calculada de forma preguiçosa (`stock + rate × Δt`, limitado pela capacidade) quando o estado é lido.

---

## 5. Mapa do mundo (`map.ts`)

- Grade **120×120** (14.400 casas), coordenadas `(x, y)`, `y = 0` no polo norte, sem wrap.
- Distância de linha ao equador: `d = floor(|y − 59,5|)` → 0 a 59.
- Marchas andam em linha reta (distância euclidiana entre centros de casa). Obstáculos são decorativos e não bloqueiam (sem pathfinding no MVP).

### 5.1 Biomas

| Bioma | id | `d` | Linhas `y` | Inimigo | Nível acamp. | Nível nó | Peso dos nós (Comida/Madeira/Pedra/Ouro) | Cor base / alternada |
|---|---|---|---|---|---|---|---|---|
| Vales do Braseiro | `vale` | 0–19 | 40–79 | `npc_hollow` | 1–3 | 1–2 | 40 / 40 / 15 / 5 | `#3E5B35` / `#46663C` |
| Ermos de Sal | `waste` | 20–39 | 20–39 e 80–99 | `npc_brine` | 4–7 | 3–4 | 15 / 10 / 40 / 35 | `#A8834E` / `#B8935C` |
| Coroa Gélida | `frost` | 40–59 | 0–19 e 100–119 | `npc_pale` | 8–10 | 5–6 | 10 / 20 / 30 / 40 | `#AFC2CF` / `#C3D3DD` |

Cada bioma tem 4.800 casas.

### 5.2 Ocupação e geração

| Item | Valor |
|---|---|
| Obstáculos (montanha `mountain`, lago `lake`, ruína `ruin`) | 8% das casas de cada bioma (384) |
| Nós de recurso | 5% por bioma (240) |
| Acampamentos NPC | 3% por bioma (144) |
| Nível dentro do bioma | `t = (d − dMin) / 20`; `nível = min + floor(t × (max − min + 1))`; 20% de chance de ±1 (preso à faixa). Sobe em direção ao polo. |
| Manutenção | Tick do mundo a cada 60 s recria nós/acampamentos até a densidade-alvo |
| Spawn de jogador | Casa livre com `d ≤ 14` (y 45–74), ≥ 8 casas (Chebyshev) de outra cidade, ≥ 2 de nó/acampamento |
| Cidade | Ocupa 1 casa. Não se move no MVP |

---

## 6. Recursos (`resources.ts`)

| id | Nome | Uso principal |
|---|---|---|
| `food` | Comida | Tropas (treino e manutenção), prédios |
| `wood` | Madeira | Prédios, tropas |
| `stone` | Pedra | Muralha, prédios, tropas T2/T3 |
| `gold` | Ouro | Cidadela, muralha, salão, tropas T2/T3, taverna, cura |

| Estado inicial | Comida | Madeira | Pedra | Ouro |
|---|---|---|---|---|
| Recursos | 1.500 | 1.500 | 800 | 500 |
| Produção base da Cidadela (/h, fixa) | 100 | 100 | 50 | 20 |

- Produção passiva para quando o estoque atinge a capacidade do Armazém. Recurso de coleta, saque e baú **pode** passar da capacidade.
- Manutenção de tropas sai da produção de comida (ver 8). Comida não fica negativa; com 0, nada é tirado, mas sem comida não se treina nem constrói.

---

## 7. Cidade e prédios (`buildings.ts`)

**Nível da vila = nível da Cidadela (`keep`).** Nenhum prédio passa do nível da Cidadela.

| id | Nome | Libera na Cidadela | Começa em | Função |
|---|---|---|---|---|
| `keep` | Cidadela | — | 1 | Nível da vila; limita os outros; produção base |
| `farm` | Fazenda | 1 | 1 | Comida/h |
| `sawmill` | Serraria | 1 | 1 | Madeira/h |
| `barracks` | Quartel | 1 | 1 | Treina tropas; libera tiers; acelera treino |
| `quarry` | Pedreira | 2 | 0 | Pedra/h |
| `warehouse` | Armazém | 2 | 0 | Capacidade e recurso protegido de saque |
| `wall` | Muralha | 2 | 0 | Bônus de DEF e VIDA a quem defende a cidade |
| `infirmary` | Enfermaria | 2 | 0 | Capacidade de feridos |
| `hero_hall` | Salão dos Heróis (Taverna) | 2 | 0 | Recrutamento, nível máx. de herói, comandante de defesa |
| `gold_mine` | Mina de Ouro | 3 | 0 | Ouro/h |

**Pré-requisitos da Cidadela:** nível N (N ≥ 3) exige Muralha ≥ N−1; nível N (N ≥ 5) exige também Quartel ≥ N−1.
**Filas de obra:** 1 (2 a partir da Cidadela 6). Cancelar devolve 50% do custo.
**Estado inicial:** Cidadela 1, Fazenda 1, Serraria 1, Quartel 1; 80 `infantry_t1`, 40 `archer_t1`; herói Aldric nv 1; escudo de novato.

### 7.1 Curvas

```
custo(nível)  = round(custoBase × 1,6^(nível−1))     // nível = nível de destino
tempo(nível)  = round(tempoBase × 1,5^(nível−1)) s   // antes do GAME_SPEED
produção(nv)  = round(prodBase × 1,45^(nível−1)) /h  // antes do ECONOMY_SPEED
```

| | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Custo ×1,6^(nv−1) | 1,000 | 1,600 | 2,560 | 4,096 | 6,554 | 10,486 | 16,777 | 26,844 | 42,950 | 68,719 |
| Tempo ×1,5^(nv−1) | 1,000 | 1,500 | 2,250 | 3,375 | 5,063 | 7,594 | 11,391 | 17,086 | 25,629 | 38,443 |
| Produção ×1,45^(nv−1) | 1,000 | 1,450 | 2,103 | 3,049 | 4,421 | 6,410 | 9,294 | 13,476 | 19,541 | 28,334 |

| id | Custo base (C / M / P / O) | Tempo base (s) |
|---|---|---|
| `keep` | 180 / 200 / 150 / 40 | 10 |
| `farm` | 0 / 90 / 30 / 0 | 6 |
| `sawmill` | 90 / 0 / 30 / 0 | 6 |
| `quarry` | 90 / 90 / 0 / 0 | 6 |
| `gold_mine` | 120 / 120 / 60 / 0 | 8 |
| `barracks` | 120 / 160 / 60 / 0 | 8 |
| `warehouse` | 60 / 140 / 100 / 0 | 6 |
| `wall` | 0 / 80 / 180 / 20 | 8 |
| `hero_hall` | 120 / 120 / 60 / 40 | 8 |
| `infirmary` | 100 / 100 / 60 / 0 | 6 |

### 7.2 Custo e tempo por nível (resultado)

Nível 1 da Cidadela, Fazenda, Serraria e Quartel já vem construído (o custo de nível 1 deles não é usado).

**Cidadela (`keep`)**

| | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Comida | 180 | 288 | 461 | 737 | 1.180 | 1.887 | 3.020 | 4.832 | 7.731 | 12.370 |
| Madeira | 200 | 320 | 512 | 819 | 1.311 | 2.097 | 3.355 | 5.369 | 8.590 | 13.744 |
| Pedra | 150 | 240 | 384 | 614 | 983 | 1.573 | 2.517 | 4.027 | 6.442 | 10.308 |
| Ouro | 40 | 64 | 102 | 164 | 262 | 419 | 671 | 1.074 | 1.718 | 2.749 |
| Tempo | 10s | 15s | 23s | 34s | 51s | 1m16s | 1m54s | 2m51s | 4m16s | 6m24s |

**Fazenda (`farm`)**

| | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Madeira | 90 | 144 | 230 | 369 | 590 | 944 | 1.510 | 2.416 | 3.865 | 6.185 |
| Pedra | 30 | 48 | 77 | 123 | 197 | 315 | 503 | 805 | 1.288 | 2.062 |
| Tempo | 6s | 9s | 14s | 20s | 30s | 46s | 1m08s | 1m43s | 2m34s | 3m51s |

**Serraria (`sawmill`)**

| | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Comida | 90 | 144 | 230 | 369 | 590 | 944 | 1.510 | 2.416 | 3.865 | 6.185 |
| Pedra | 30 | 48 | 77 | 123 | 197 | 315 | 503 | 805 | 1.288 | 2.062 |
| Tempo | 6s | 9s | 14s | 20s | 30s | 46s | 1m08s | 1m43s | 2m34s | 3m51s |

**Pedreira (`quarry`)**

| | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Comida | 90 | 144 | 230 | 369 | 590 | 944 | 1.510 | 2.416 | 3.865 | 6.185 |
| Madeira | 90 | 144 | 230 | 369 | 590 | 944 | 1.510 | 2.416 | 3.865 | 6.185 |
| Tempo | 6s | 9s | 14s | 20s | 30s | 46s | 1m08s | 1m43s | 2m34s | 3m51s |

**Mina de Ouro (`gold_mine`)**

| | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Comida | 120 | 192 | 307 | 492 | 786 | 1.258 | 2.013 | 3.221 | 5.154 | 8.246 |
| Madeira | 120 | 192 | 307 | 492 | 786 | 1.258 | 2.013 | 3.221 | 5.154 | 8.246 |
| Pedra | 60 | 96 | 154 | 246 | 393 | 629 | 1.007 | 1.611 | 2.577 | 4.123 |
| Tempo | 8s | 12s | 18s | 27s | 41s | 1m01s | 1m31s | 2m17s | 3m25s | 5m08s |

**Quartel (`barracks`)**

| | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Comida | 120 | 192 | 307 | 492 | 786 | 1.258 | 2.013 | 3.221 | 5.154 | 8.246 |
| Madeira | 160 | 256 | 410 | 655 | 1.049 | 1.678 | 2.684 | 4.295 | 6.872 | 10.995 |
| Pedra | 60 | 96 | 154 | 246 | 393 | 629 | 1.007 | 1.611 | 2.577 | 4.123 |
| Tempo | 8s | 12s | 18s | 27s | 41s | 1m01s | 1m31s | 2m17s | 3m25s | 5m08s |

**Armazém (`warehouse`)**

| | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Comida | 60 | 96 | 154 | 246 | 393 | 629 | 1.007 | 1.611 | 2.577 | 4.123 |
| Madeira | 140 | 224 | 358 | 573 | 918 | 1.468 | 2.349 | 3.758 | 6.013 | 9.621 |
| Pedra | 100 | 160 | 256 | 410 | 655 | 1.049 | 1.678 | 2.684 | 4.295 | 6.872 |
| Tempo | 6s | 9s | 14s | 20s | 30s | 46s | 1m08s | 1m43s | 2m34s | 3m51s |

**Muralha (`wall`)**

| | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Madeira | 80 | 128 | 205 | 328 | 524 | 839 | 1.342 | 2.147 | 3.436 | 5.498 |
| Pedra | 180 | 288 | 461 | 737 | 1.180 | 1.887 | 3.020 | 4.832 | 7.731 | 12.370 |
| Ouro | 20 | 32 | 51 | 82 | 131 | 210 | 336 | 537 | 859 | 1.374 |
| Tempo | 8s | 12s | 18s | 27s | 41s | 1m01s | 1m31s | 2m17s | 3m25s | 5m08s |

**Salão dos Heróis (`hero_hall`)**

| | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Comida | 120 | 192 | 307 | 492 | 786 | 1.258 | 2.013 | 3.221 | 5.154 | 8.246 |
| Madeira | 120 | 192 | 307 | 492 | 786 | 1.258 | 2.013 | 3.221 | 5.154 | 8.246 |
| Pedra | 60 | 96 | 154 | 246 | 393 | 629 | 1.007 | 1.611 | 2.577 | 4.123 |
| Ouro | 40 | 64 | 102 | 164 | 262 | 419 | 671 | 1.074 | 1.718 | 2.749 |
| Tempo | 8s | 12s | 18s | 27s | 41s | 1m01s | 1m31s | 2m17s | 3m25s | 5m08s |

**Enfermaria (`infirmary`)**

| | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Comida | 100 | 160 | 256 | 410 | 655 | 1.049 | 1.678 | 2.684 | 4.295 | 6.872 |
| Madeira | 100 | 160 | 256 | 410 | 655 | 1.049 | 1.678 | 2.684 | 4.295 | 6.872 |
| Pedra | 60 | 96 | 154 | 246 | 393 | 629 | 1.007 | 1.611 | 2.577 | 4.123 |
| Tempo | 6s | 9s | 14s | 20s | 30s | 46s | 1m08s | 1m43s | 2m34s | 3m51s |

Total para levar os 10 prédios ao nível 10: 159.614 comida, 199.543 madeira, 132.413 pedra, 18.118 ouro (509.688 no total).

### 7.3 Produção (/h)

```
farm = 400 × 1,45^(nv−1)   sawmill = 400 × 1,45^(nv−1)   quarry = 300 × 1,45^(nv−1)   gold_mine = 150 × 1,45^(nv−1)
```

| | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Fazenda (comida) | 400 | 580 | 841 | 1.219 | 1.768 | 2.564 | 3.718 | 5.391 | 7.816 | 11.334 |
| Serraria (madeira) | 400 | 580 | 841 | 1.219 | 1.768 | 2.564 | 3.718 | 5.391 | 7.816 | 11.334 |
| Pedreira (pedra) | 300 | 435 | 631 | 915 | 1.326 | 1.923 | 2.788 | 4.043 | 5.862 | 8.500 |
| Mina de Ouro (ouro) | 150 | 218 | 315 | 457 | 663 | 961 | 1.394 | 2.021 | 2.931 | 4.250 |

### 7.4 Efeitos dos outros prédios

```
armazém.capacidade(nv)  = 5000 + 4000 × 1,5^(nv−1)      (nv 0 = 5000)   por recurso
armazém.protegido(nv)   = 1000 + 1000 × 1,45^(nv−1)     (nv 0 = 1000)   por recurso, não pode ser saqueado
enfermaria.capacidade   = 100 + 200 × 1,5^(nv−1)        (nv 0 = 100)    feridos
quartel.tempoTreino     = × (1 − 0,04 × (nv−1));  lote máx. = 50 × nv
muralha                 = +5% DEF e +5% VIDA por nível a todas as tropas que defendem a cidade (inclui reforços)
salão.nívelMáxHerói     = max(2, 2 × nv);  custo do chamado = round(300 × (1 − 0,03 × nv)) ouro
```

| | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Armazém: capacidade | 9.000 | 11.000 | 14.000 | 18.500 | 25.250 | 35.375 | 50.563 | 73.344 | 107.516 | 158.773 |
| Armazém: protegido | 2.000 | 2.450 | 3.103 | 4.049 | 5.421 | 7.410 | 10.294 | 14.476 | 20.541 | 29.334 |
| Enfermaria: feridos | 300 | 400 | 550 | 775 | 1.113 | 1.619 | 2.378 | 3.517 | 5.226 | 7.789 |
| Quartel: tempo × | 1,00 | 0,96 | 0,92 | 0,88 | 0,84 | 0,80 | 0,76 | 0,72 | 0,68 | 0,64 |
| Quartel: lote máx. | 50 | 100 | 150 | 200 | 250 | 300 | 350 | 400 | 450 | 500 |
| Muralha: DEF e VIDA | +5% | +10% | +15% | +20% | +25% | +30% | +35% | +40% | +45% | +50% |
| Salão: herói nv máx. | 2 | 4 | 6 | 8 | 10 | 12 | 14 | 16 | 18 | 20 |
| Salão: chamado (ouro) | 291 | 282 | 273 | 264 | 255 | 246 | 237 | 228 | 219 | 210 |

---

## 8. Tropas (`troops.ts`)

Três tipos, três tiers. Mesma velocidade dentro do tipo.

**Triângulo:** Infantaria (lanças) > Cavalaria > Arqueiros > Infantaria. Vantagem = ×1,25 de dano; desvantagem = ×0,8; mesmo tipo = ×1.

| Tier | Libera | Era |
|---|---|---|
| T1 | Quartel 1 | I |
| T2 | Quartel 4 | II |
| T3 | Quartel 8 | III |

| id | Nome | C | M | P | O | Tempo (s) | ATQ | DEF | VIDA | Carga | Veloc. (casas/min) | Manut. (comida/h) | Poder |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `infantry_t1` | Lança de Cinza | 30 | 25 | 0 | 0 | 1,5 | 8 | 12 | 40 | 10 | 20 | 0,5 | 3 |
| `infantry_t2` | Escudo Jurado | 55 | 45 | 15 | 4 | 3 | 12 | 18 | 60 | 14 | 20 | 1 | 6 |
| `infantry_t3` | Guardião do Braseiro | 90 | 75 | 30 | 10 | 6 | 18 | 27 | 90 | 18 | 20 | 1,5 | 12 |
| `archer_t1` | Arqueiro de Turfa | 30 | 35 | 0 | 0 | 1,5 | 12 | 6 | 30 | 8 | 20 | 0,5 | 3 |
| `archer_t2` | Besteiro Jurado | 55 | 60 | 10 | 4 | 3 | 18 | 9 | 45 | 11 | 20 | 1 | 6 |
| `archer_t3` | Atirador de Brasa | 90 | 100 | 20 | 10 | 6 | 27 | 14 | 68 | 14 | 20 | 1,5 | 12 |
| `cavalry_t1` | Batedor Montado | 45 | 20 | 10 | 0 | 1,5 | 11 | 8 | 45 | 15 | 30 | 0,5 | 3 |
| `cavalry_t2` | Cavaleiro de Cinza | 80 | 35 | 25 | 6 | 3 | 16 | 12 | 68 | 20 | 30 | 1 | 6 |
| `cavalry_t3` | Cavaleiro da Mortalha | 130 | 60 | 45 | 15 | 6 | 24 | 18 | 100 | 26 | 30 | 1,5 | 12 |

- Tempo é por unidade; tempo do lote = `qtd × tempo × fatorQuartel / GAME_SPEED`.
- **Cura** (Enfermaria): 40% do custo e 40% do tempo de treino, por unidade.
- **Poder** do jogador (ranking entre amigos) = Σ(tropas × poder) + 20 × Σ(níveis de prédios).

---

## 9. Comandantes e heróis (`heroes.ts`)

**Regras**
- Toda marcha exige **1 comandante principal**. Pode levar até **2 secundários** (slots liberados pela Cidadela, ver 15).
- Principal: passiva 100% + habilidade. Secundário: 50% dos números da passiva, sem habilidade.
- Herói em marcha fica indisponível. Herói não morre.
- **Comandante de defesa:** 1 herói escolhido no Salão. Se estiver em casa quando a cidade é atacada, aplica passiva 100% + habilidade na defesa. Heróis de reforços não aplicam bônus.
- Bônus do mesmo atributo somam de forma aditiva (ex.: DEF +14% do herói + 15% da muralha = ×1,29).

| id | Nome, título | Raridade | Passiva (nv 1; + por nível) | Habilidade (só principal) | Obtenção |
|---|---|---|---|---|---|
| `hero_aldric` | Aldric Varn, o Último Escudo | Comum | Infantaria: DEF +10% (+1%), VIDA +5% (+0,5%) | **Parede de Escudos** (`shield_wall`): rodada 1, o próprio lado recebe −25% de dano | Inicial |
| `hero_dorrik` | Dorrik Pá-Torta, o Farejador de Veios | Comum | Velocidade de coleta +15% (+1,5%) | **Lombo de Mula** (`mule_back`, fora de combate): carga da marcha +20% | Grátis ao chegar na Cidadela 2 |
| `hero_seris` | Seris Malvane, a Mira de Cinza | Raro | Arqueiros: ATQ +10% (+1%) | **Chuva de Brasas** (`ember_rain`): rodada 2, arqueiros +60% de dano | 10 fragmentos |
| `hero_brannoc` | Brannoc Hal, o Corvo de Estrada | Raro | Cavalaria: ATQ +8% (+0,8%); velocidade de marcha +10% (fixo) | **Investida** (`charge`): rodada 1, cavalaria +50% de dano | 10 fragmentos |
| `hero_ysolde` | Madre Ysolde, a Vela Negra | Épico | Todas as tropas: VIDA +5% (+0,5%) | **Última Unção** (`last_rite`): no fim do combate, 50% dos mortos do lado dela viram feridos | 20 fragmentos |
| `hero_vesna` | Vesna Korr, a Ceifadora Pálida | Épico | Todas as tropas: ATQ +6% (+0,6%); saque +15% (fixo) | **Ceifa** (`reap`): rodada 3, o próprio lado +40% de dano | 20 fragmentos |

Passiva no nível N = `base + porNível × (N − 1)`. Ex.: Aldric nv 20 = Infantaria DEF +29%, VIDA +14,5%.

### 9.1 Obtenção

- Fragmentos (`hero_fragment`) vêm de baús, baú diário e chamados na taverna. Fragmento de herói já liberado vira **100 XP** para esse herói.
- Fragmento aleatório: sorteia a raridade (Comum 50 / Raro 38 / Épico 12) e depois o herói dentro da raridade (uniforme).
- **Chamado na taverna** (`hero_hall`): dá 5 fragmentos aleatórios. Custo: `round(300 × (1 − 0,03 × nívelSalão))` ouro. 1 chamado grátis por dia (Salão ≥ 1). **Garantia:** todo 10º chamado (pago ou grátis) é de herói Épico.

### 9.2 Nível e XP

- Nível máximo = `max(2, 2 × nívelSalão)` (teto 20).
- XP para subir do nível N para N+1 = `round(100 × 1,3^(N−1))`.
- Fontes de XP: acampamento NPC (tabela da seção 10); PvP = poder das tropas inimigas perdidas (mortos + feridos); coleta = 1 XP por 50 recursos coletados; tomos dos baús; fragmentos excedentes. Principal ganha 100%, secundários 50%. XP acima do nível máx. fica acumulada.

| Nível → próximo | XP | XP acumulada | Nível → próximo | XP | XP acumulada |
|---|---|---|---|---|---|
| 1→2 | 100 | 100 | 11→12 | 1.379 | 5.641 |
| 2→3 | 130 | 230 | 12→13 | 1.792 | 7.433 |
| 3→4 | 169 | 399 | 13→14 | 2.330 | 9.763 |
| 4→5 | 220 | 619 | 14→15 | 3.029 | 12.792 |
| 5→6 | 286 | 905 | 15→16 | 3.937 | 16.729 |
| 6→7 | 371 | 1.276 | 16→17 | 5.119 | 21.848 |
| 7→8 | 483 | 1.759 | 17→18 | 6.654 | 28.502 |
| 8→9 | 627 | 2.386 | 18→19 | 8.650 | 37.152 |
| 9→10 | 816 | 3.202 | 19→20 | 11.246 | 48.398 |
| 10→11 | 1.060 | 4.262 |  |  |  |

---

## 10. NPCs no mapa (`npc.ts`)

```
tropas(nível)   = round(70 × 1,45^(nível−1))
tier(nível)     = T1 (1–3), T2 (4–7), T3 (8–10)
xpHerói(nível)  = round(50 × 1,5^(nível−1))
respawn(nível)  = 30 × nível segundos (/GAME_SPEED), em outra casa livre do mesmo bioma
```

- NPC usa os mesmos stats das tropas do jogador (só muda o visual), com a composição da facção (seção 2.2).
- Vitória contra NPC = acampamento zerado. Se o jogador perde, o acampamento volta cheio (perdas do NPC não ficam salvas no MVP).
- Sem bônus de muralha nem herói do lado do NPC.

| Nível | Bioma | Facção | Tier | Tropas | Composição | Poder | XP herói | Baú | Respawn |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `vale` | `npc_hollow` | T1 | 70 | 42 infantaria, 28 arqueiros | 210 | 50 | `chest_iron` | 30s |
| 2 | `vale` | `npc_hollow` | T1 | 102 | 61 infantaria, 41 arqueiros | 306 | 75 | `chest_iron` | 1m00s |
| 3 | `vale` | `npc_hollow` | T1 | 147 | 88 infantaria, 59 arqueiros | 441 | 113 | `chest_iron` | 1m30s |
| 4 | `waste` | `npc_brine` | T2 | 213 | 85 cavalaria, 64 infantaria, 64 arqueiros | 1.278 | 169 | `chest_bronze` | 2m00s |
| 5 | `waste` | `npc_brine` | T2 | 309 | 124 cavalaria, 93 infantaria, 92 arqueiros | 1.854 | 253 | `chest_bronze` | 2m30s |
| 6 | `waste` | `npc_brine` | T2 | 449 | 180 cavalaria, 135 infantaria, 134 arqueiros | 2.694 | 380 | `chest_bronze` | 3m00s |
| 7 | `waste` | `npc_brine` | T2 | 651 | 260 cavalaria, 195 infantaria, 196 arqueiros | 3.906 | 570 | `chest_bronze` | 3m30s |
| 8 | `frost` | `npc_pale` | T3 | 943 | 472 infantaria, 283 cavalaria, 188 arqueiros | 11.316 | 854 | `chest_relic` | 4m00s |
| 9 | `frost` | `npc_pale` | T3 | 1.368 | 684 infantaria, 410 cavalaria, 274 arqueiros | 16.416 | 1.281 | `chest_relic` | 4m30s |
| 10 | `frost` | `npc_pale` | T3 | 1.983 | 992 infantaria, 595 cavalaria, 396 arqueiros | 23.796 | 1.922 | `chest_relic` | 5m00s |

Composição: cada tipo recebe `round(tropas × %)`, o último tipo fica com o resto.

Referência de balanceamento (simulado com a fórmula da seção 13, Aldric nv 2×L, exército 40% infantaria / 30% arqueiros / 30% cavalaria do tier da era, mas T1 no nível 4, recém-chegado na Era II): com a marcha cheia da Cidadela L, o acampamento de nível L cai com 4% a 25% de baixas; com 60% da marcha, as baixas vão de 9% a 59%, e o nível 10 já vence o jogador. O exército inicial (80 infantaria + 40 arqueiros) vence o acampamento 1 perdendo cerca de 20%.

---

## 11. Baús e taverna (`chests.ts`)

### 11.1 Itens

| id | Conteúdo |
|---|---|
| `res_random_s` | 500 comida ou 500 madeira ou 400 pedra ou 200 ouro (pesos 35 / 35 / 20 / 10) |
| `res_random_m` | 2.500 / 2.500 / 2.000 / 1.000 (mesmos pesos) |
| `res_random_l` | 12.500 / 12.500 / 10.000 / 5.000 (mesmos pesos) |
| `speedup_1m`, `speedup_5m`, `speedup_15m`, `speedup_60m` | Reduz em 1 / 5 / 15 / 60 min um timer de obra, treino ou cura (não vale para marcha) |
| `tome_xp_s`, `tome_xp_m`, `tome_xp_l` | 200 / 1.000 / 5.000 XP para o herói escolhido |
| `hero_fragment` ×N | N fragmentos aleatórios (seção 9.1) |

Speedups são opcionais: com `features.speedups = false`, cada speedup sorteado vira `res_random` do tamanho do baú.

### 11.2 Tabelas de drop

Cada baú dá os itens **garantidos** + N **sorteios** independentes com os pesos abaixo.

| Baú (id) | Origem | Garantido | Sorteios | Pesos |
|---|---|---|---|---|
| Baú de Ferro (`chest_iron`) | Acampamento 1–3 | 1× `res_random_s` | 1 | `res_random_s` 40 · `speedup_1m` 25 · `tome_xp_s` 20 · fragmento ×1 10 · `speedup_5m` 5 |
| Baú de Bronze (`chest_bronze`) | Acampamento 4–7 | 1× `res_random_m` | 2 | `res_random_m` 35 · `speedup_5m` 20 · `tome_xp_m` 15 · fragmento ×2 15 · `speedup_15m` 10 · `tome_xp_s` ×3 5 |
| Relicário (`chest_relic`) | Acampamento 8–10 | 1× `res_random_l` + fragmento ×3 | 2 | `res_random_l` 30 · `speedup_15m` 20 · `tome_xp_m` 20 · fragmento ×5 15 · `speedup_60m` 10 · `tome_xp_l` 5 |
| Oferenda do Braseiro (`chest_daily`) | 1 por dia, grátis | 400×C comida, 400×C madeira, 300×C pedra, 150×C ouro (C = nível da Cidadela) + fragmento ×2 | 1 | `speedup_5m` 35 · `tome_xp_m` 30 · fragmento ×3 25 · `speedup_15m` 10 |

- Baú de NPC vai para o inventário quando a marcha volta para casa; abrir é instantâneo.

---

## 12. Marchas e coleta (`marches.ts`)

| Tipo | id | Alvo | Fim |
|---|---|---|---|
| Coletar | `gather` | Nó de recurso livre | Coleta até encher a carga ou esvaziar o nó; volta |
| Atacar NPC | `attack_npc` | Acampamento | Combate na chegada; volta com baú (se venceu) e feridos |
| Atacar jogador | `attack_player` | Cidade de outro jogador | Combate na chegada; volta com saque e feridos |
| Reforçar | `reinforce` | Cidade de outro jogador | Fica lá defendendo até ser chamada de volta |
| Voltar | `return` | (estado) | Tropas, herói, saque e feridos entram na cidade |

**Regras**
- Marcha = 1 comandante principal + até 2 secundários + tropas (soma ≤ capacidade de marcha da Cidadela).
- Velocidade = menor velocidade entre as tropas × (1 + bônus de velocidade) × `GAME_SPEED`.
- `tempoViagem = max(MIN_MARCH_SECONDS, distância / velocidade × 60)` segundos. Volta leva o mesmo tempo.
- Exemplos (infantaria, 20 casas/min): 5 casas = 15 s; 20 = 60 s; 50 = 150 s. Cavalaria pura (30 casas/min): 50 casas = 100 s.
- Chamar de volta: na ida, volta do ponto atual (tempo = tempo já andado); coletando, volta com o que já coletou; reforço, volta normal.
- Estados: `outbound` → `gathering` | `stationed` | (combate instantâneo) → `returning` → `done`.
- Nó ocupado por outra marcha quando você chega: sua marcha volta vazia (sem combate no MVP).
- Se o alvo some (acampamento derrotado por outro, escudo ativado na cidade), a marcha volta.

**Coleta**

```
carga        = Σ(qtd × cargaUnidade) × (1 + bônus de carga)
taxa (/min)  = taxaBase[recurso] × 1,3^(nívelNó−1) × (1 + bônus de coleta) × ECONOMY_SPEED × GAME_SPEED
duração      = min(carga, restanteNó) / taxa
capacidadeNó = capBase[recurso] × 1,6^(nívelNó−1)
```

Nó esvaziado some e reaparece em outra casa do mesmo bioma após 120 s.

Bases: capacidade 6.000 / 6.000 / 4.500 / 2.500; taxa 80 / 80 / 60 / 30 por minuto.

| Nível do nó | Bioma | Capacidade C / M / P / O | Taxa por minuto C / M / P / O |
|---|---|---|---|
| 1 | `vale` | 6.000 / 6.000 / 4.500 / 2.500 | 80 / 80 / 60 / 30 |
| 2 | `vale` | 9.600 / 9.600 / 7.200 / 4.000 | 104 / 104 / 78 / 39 |
| 3 | `waste` | 15.360 / 15.360 / 11.520 / 6.400 | 135 / 135 / 101 / 51 |
| 4 | `waste` | 24.576 / 24.576 / 18.432 / 10.240 | 176 / 176 / 132 / 66 |
| 5 | `frost` | 39.322 / 39.322 / 29.491 / 16.384 | 228 / 228 / 171 / 86 |
| 6 | `frost` | 62.915 / 62.915 / 47.186 / 26.214 | 297 / 297 / 223 / 111 |

Exemplo: marcha inicial (80 infantaria + 40 arqueiros, carga 1.120) num nó de comida nível 1 leva 14 min para encher.

---

## 13. Combate (`combat.ts`)

Resolvido no servidor no instante em que a marcha chega. **Determinístico**: mesma entrada, mesmo resultado.

### 13.1 Constantes

| Chave | Valor |
|---|---|
| `MAX_ROUNDS` | 5 |
| `DEF_K` | 50 |
| `TRIANGLE` | vantagem 1,25 · neutro 1 · desvantagem 0,8 |
| Feridos (atacante vs NPC) | 80% das baixas |
| Feridos (atacante vs jogador) | 40% das baixas |
| Feridos (defensor, inclusive reforços) | 70% das baixas |
| `LOOT_RATE` | 40% do recurso não protegido |

### 13.2 Fórmula

Cada lado é uma lista de **pilhas** `(tipo, tier, qtd)`. Os dois lados batem ao mesmo tempo em cada rodada, usando as quantidades do início da rodada.

```
para r = 1..MAX_ROUNDS (para antes se um lado zerar):
  para cada pilha s viva do lado X e cada pilha t viva do lado Y:
    saída_s  = qtd_s × ATQ_s × (1 + bônusATQ_X[tipo_s]) × (1 + bônusRodada_X(r, tipo_s))
    fatia_t  = qtd_t / Σ qtd vivas do lado Y
    tri      = TRIANGLE[tipo_s][tipo_t]
    mitig_t  = DEF_K / (DEF_K + DEF_t × (1 + bônusDEF_Y[tipo_t]))
    dano[t] += saída_s × fatia_t × tri × mitig_t × (1 + danoRecebido_Y(r))
  baixas_t = min(qtd_t, dano[t] / (VIDA_t × (1 + bônusVIDA_Y[tipo_t])))
  aplica as baixas dos dois lados (quantidades ficam fracionárias durante a luta)
```

- `bônusATQ/DEF/VIDA`: heróis (passivas) + muralha (só defensor de cidade) + facção Pálida (+10% DEF/VIDA).
- `bônusRodada`: habilidades de dano (Investida, Chuva de Brasas, Ceifa). `danoRecebido`: Parede de Escudos (−0,25 na rodada 1).
- **Resultado final por pilha:** `baixas = round(qtdInicial − qtdFinal)`; `feridos = floor(baixas × taxaFeridos)`; `mortos = baixas − feridos`. Última Unção: `feridos += floor(mortos × 0,5)`, `mortos −= o mesmo`.
- **Vencedor:**
  - Lado zerado perde.
  - Contra NPC: o atacante só vence se zerar o acampamento.
  - Contra jogador, se os dois sobram após 5 rodadas: compara a fração de vida restante (`Σ qtd×VIDA×(1+bônus)` final / inicial). Atacante vence só se a dele for **maior**; empate = defensor.
  - Cidade sem tropas em casa: atacante vence sem rodadas.
- **Feridos:** do defensor vão direto para a Enfermaria; do atacante entram quando a marcha volta. O que passar da capacidade livre da Enfermaria morre.
- **Saque** (atacante vence contra jogador):
  ```
  saqueável[r] = max(0, estoque[r] − protegido[r]) × LOOT_RATE × (1 + bônusSaque)
  cargaLivre   = Σ(sobreviventes × carga) × (1 + bônus de carga)
  se Σ saqueável > cargaLivre: cada recurso × (cargaLivre / Σ saqueável)
  saque[r]     = floor(resultado)
  ```
- **XP:** atacante ganha o poder das baixas do defensor (e vice-versa); NPC dá o XP fixo da tabela da seção 10.

### 13.3 Exemplo calculado (PvP)

**Atacante:** Cidadela 3. Principal Brannoc nv 6 (cavalaria ATQ +12%, Investida), secundário Seris nv 4 (arqueiros ATQ +13% × 50% = +6,5%). Tropas: 120 `cavalry_t1`, 80 `infantry_t1`, 60 `archer_t1` (260 ≤ capacidade 510).
**Defensor:** Muralha 3 (+15% DEF e VIDA), comandante de defesa Aldric nv 5 (infantaria DEF +14%, VIDA +7%, Parede de Escudos). Em casa: 100 `infantry_t1`, 80 `archer_t1`. Estoque 9.000 C / 8.000 M / 3.000 P / 1.500 O; Armazém 2 (protege 2.450 de cada). Enfermaria 2 (400).

**Rodada 1, dano nos arqueiros do defensor** (DEF efetiva 6 × 1,15 = 6,9 → `mitig = 50 / 56,9 = 0,8787`; Parede de Escudos ×0,75; `fatia = 80/180 = 0,4444`):

| Origem | saída | × fatia | × tri | × mitig | × 0,75 = dano |
|---|---|---|---|---|---|
| 120 cavalaria | 120 × 11 × 1,12 × 1,5 = 2.217,6 | 985,6 | ×1,25 → 1.232,0 | 1.082,6 | **811,9** |
| 80 infantaria | 80 × 8 = 640,0 | 284,4 | ×0,8 → 227,6 | 200,0 | **150,0** |
| 60 arqueiros | 60 × 12 × 1,065 = 766,8 | 340,8 | ×1 → 340,8 | 299,5 | **224,6** |
| **Total** | | | | | **1.186,5** |

VIDA efetiva do arqueiro defensor = 30 × 1,15 = 34,5 → **baixas = 1.186,5 / 34,5 = 34,39**. Do mesmo jeito: infantaria defensora sofre 1.073,0 de dano (VIDA 40 × 1,22 = 48,8) → 21,99 baixas; o atacante sofre 703,4 / 496,3 / 329,7 em cavalaria / infantaria / arqueiros → 15,63 / 12,41 / 10,99 baixas.

**Quantidades no fim de cada rodada**

| Rodada | Atq. cavalaria | Atq. infantaria | Atq. arqueiros | Def. infantaria | Def. arqueiros |
|---|---|---|---|---|---|
| início | 120 | 80 | 60 | 100 | 80 |
| 1 | 104,37 | 67,59 | 49,01 | 78,01 | 45,61 |
| 2 | 93,35 | 59,53 | 42,10 | 54,78 | 20,55 |
| 3 | 86,51 | 54,93 | 38,26 | 31,24 | 4,18 |
| 4 | 83,26 | 53,00 | 36,68 | 4,97 | 0 |
| 5 | 82,80 | 52,76 | 36,48 | 0 | 0 |

**Resultado:** defensor zerado → **atacante vence**.

| | Baixas | Feridos | Mortos |
|---|---|---|---|
| Atacante | 37 cav. + 27 inf. + 24 arq. = 88 | 40%: 14 + 10 + 9 = 33 | 55 |
| Defensor | 100 inf. + 80 arq. = 180 | 70%: 70 + 56 = 126 (cabem na Enfermaria) | 54 |

**Saque:** não protegido = 6.550 C / 5.550 M / 550 P / 0 O → × 40% = 2.620 / 2.220 / 220 / 0 (total 5.060). Carga dos sobreviventes = 83×15 + 53×10 + 36×8 = **2.063** < 5.060 → fator 0,4077 → **saque = 1.068 C / 905 M / 89 P / 0 O**.
**XP:** Brannoc +540 (180 tropas T1 × poder 3), Seris +270, Aldric (defesa) +264. O defensor ganha a Trégua de 30 min (seção 14).

---

## 14. PvP (`pvp.ts`)

| Regra | Valor |
|---|---|
| Escudo de novato | Acaba no que vier primeiro: 24 h reais desde a criação, Cidadela 5, ou o jogador mandar um `attack_player` |
| Trégua (escudo pós-derrota) | 30 min reais quando o atacante **vence** contra você. Não acumula; atacar alguém cancela |
| Alvo com escudo | Não pode ser alvo. Se o escudo ligar com marcha a caminho, ela volta |
| Diferença de nível | Não pode atacar cidade com Cidadela 4+ níveis abaixo da sua |
| O que se perde | Tropas (feridos/mortos, seção 13), recurso não protegido até o limite de carga do atacante |
| O que não se perde | Prédios, heróis, itens, recurso protegido pelo Armazém |
| Reforços | Até a capacidade de marcha da Cidadela do anfitrião (soma de todos os reforços). Lutam junto com a guarnição; feridos vão para a Enfermaria do dono |
| Relatório | Os dois lados recebem relatório com rodadas, baixas, feridos, saque e XP |

---

## 15. Progressão e eras (`progression.ts`)

**Eras entram no MVP**, só como rótulo derivado do nível da Cidadela (sem ação de "avançar era"): mudam o visual da cidade e marcam quando cada tier de tropa abre.

| Era | id | Cidadela | Efeito |
|---|---|---|---|
| I — Era da Cinza | `era_ash` | 1–3 | T1; cidade com paliçada de madeira |
| II — Era do Ferro | `era_iron` | 4–7 | T2 (Quartel 4); cidade com muro de pedra |
| III — Era da Brasa | `era_ember` | 8–10 | T3 (Quartel 8); cidade de ferro negro com braseiro aceso |

| Cidadela | Era | Libera | Marchas simult. | Capacidade de marcha | Secundários | Filas de obra |
|---|---|---|---|---|---|---|
| 1 | I | Fazenda, Serraria, Quartel; tropas T1 | 1 | 300 | 0 | 1 |
| 2 | I | Pedreira, Armazém, Muralha, Enfermaria, Salão; herói Dorrik | 2 | 390 | 0 | 1 |
| 3 | I | Mina de Ouro | 2 | 510 | 1 | 1 |
| 4 | II | Tropas T2 (com Quartel 4) | 2 | 660 | 1 | 1 |
| 5 | II | Fim do escudo de novato | 3 | 860 | 1 | 1 |
| 6 | II | 2ª fila de obra | 3 | 1.110 | 2 | 2 |
| 7 | II | — | 4 | 1.450 | 2 | 2 |
| 8 | III | Tropas T3 (com Quartel 8) | 4 | 1.880 | 2 | 2 |
| 9 | III | — | 5 | 2.450 | 2 | 2 |
| 10 | III | Título "Guardião da Chama" (cosmético) | 5 | 3.180 | 2 | 2 |

`capacidadeMarcha(nv) = round(300 × 1,3^(nv−1) / 10) × 10`. Marchas simultâneas ficam limitadas também pelo número de heróis livres.

**Ritmo esperado (velocidade 1):** soma dos tempos de obra até tudo no 10 ≈ 2 h 16 min (mínimo teórico com 1 fila). O gargalo real é recurso: ~510 mil para os prédios. Estimativa de 2 a 4 dias de jogo para a Cidadela 10. Para acelerar o mundo, subir `ECONOMY_SPEED` primeiro (mantém os timers curtos e o recurso deixa de travar).

---

## 16. Identificadores (resumo)

| Grupo | ids |
|---|---|
| Recursos | `food`, `wood`, `stone`, `gold` |
| Prédios | `keep`, `farm`, `sawmill`, `quarry`, `gold_mine`, `barracks`, `warehouse`, `wall`, `infirmary`, `hero_hall` |
| Tropas | `infantry_t1..t3`, `archer_t1..t3`, `cavalry_t1..t3` (tipos: `infantry`, `archer`, `cavalry`) |
| Heróis | `hero_aldric`, `hero_dorrik`, `hero_seris`, `hero_brannoc`, `hero_ysolde`, `hero_vesna` |
| Habilidades | `shield_wall`, `mule_back`, `ember_rain`, `charge`, `last_rite`, `reap` |
| Raridade | `common`, `rare`, `epic` |
| Facção / NPC | `ember_oath`, `npc_hollow`, `npc_brine`, `npc_pale` |
| Biomas / tiles | `vale`, `waste`, `frost`; `empty`, `mountain`, `lake`, `ruin`, `city`, `node`, `camp` |
| Marchas | `gather`, `attack_npc`, `attack_player`, `reinforce`, `return`; estados `outbound`, `gathering`, `stationed`, `returning`, `done` |
| Baús e itens | `chest_iron`, `chest_bronze`, `chest_relic`, `chest_daily`, `res_random_s/m/l`, `speedup_1m/5m/15m/60m`, `tome_xp_s/m/l`, `hero_fragment` |
| Eras | `era_ash`, `era_iron`, `era_ember` |
| Escudos | `shield_newbie`, `shield_truce` |

### 16.1 Arquivos de config sugeridos

```
packages/shared/src/config/
  speed.ts        GAME_SPEED, ECONOMY_SPEED, MIN_MARCH_SECONDS, DAILY_RESET_TZ, WORLD_SEED
  curves.ts       curve(base, fator, nível) e helpers
  map.ts          tamanho, biomas, densidades, faixas de nível, spawn
  resources.ts    ids, estado inicial, produção base da Cidadela
  buildings.ts    bases de custo/tempo/produção, desbloqueio, pré-requisitos, efeitos
  troops.ts       stats, custos, triângulo, tiers
  heroes.ts       heróis, passivas, habilidades, raridade, curva de XP
  npc.ts          facções, curva de tropas, XP, baú por nível, respawn
  chests.ts       itens e tabelas de drop
  marches.ts      tipos, coleta (taxas, capacidade de nó)
  combat.ts       constantes e taxas de feridos/saque
  pvp.ts          escudos, diferença de nível, reforços
  progression.ts  tabela da Cidadela, eras
```

Formato sugerido (exemplo):

```ts
// curves.ts
export const curve = (base: number, factor: number, level: number): number =>
  Math.round(base * factor ** (level - 1));

// buildings.ts
export const BUILDINGS = {
  farm: {
    unlockKeepLevel: 1,
    startLevel: 1,
    baseCost: { food: 0, wood: 90, stone: 30, gold: 0 },
    costFactor: 1.6,
    baseTimeSec: 6,
    timeFactor: 1.5,
    production: { resource: 'food', base: 400, factor: 1.45 },
  },
  // ...
} as const;
```

Textos da tela (pt-BR) ficam num dicionário separado (`i18n/pt-BR.ts`) indexado pelos mesmos ids.

---

## 17. Direção de arte do MVP

**Estilo:** gótico sombrio, plano e legível. Sem ilustração: formas geométricas, ícones SVG e cor. Pense em mapa de campanha pintado sobre pergaminho queimado.

**Paleta (tokens)**

| Token | Cor | Uso |
|---|---|---|
| `--bg` | `#14110F` | Fundo geral (carvão) |
| `--panel` | `#211C18` | Painéis |
| `--panel-border` | `#4A3F35` | Bordas (ferro velho) |
| `--text` | `#E8DCC4` | Texto (pergaminho) |
| `--text-muted` | `#A89A84` | Texto secundário |
| `--ember` | `#E2572B` | Ação principal, Braseiro, destaque |
| `--gold` | `#C9A24A` | Ouro, raridade, títulos |
| `--blood` | `#8E1B1B` | Perigo, inimigo, derrota |
| `--frost` | `#7FB3D5` | Hoste Pálida, gelo |
| `--ok` | `#6B8E4E` | Sucesso |
| Raridade | Comum `#A89A84` · Raro `#5B8FC9` · Épico `#9B5BC9` | Moldura dos heróis |

**Tipografia:** títulos em *Cinzel* (Google Fonts), texto em *Inter*. Números com `font-variant-numeric: tabular-nums`.

**Mapa**
- Canvas 2D, casa de 32 px no zoom 1 (zoom 0,5 a 2), arrastar para mover, minimapa no canto com os 3 biomas.
- Cada bioma com 2 tons em xadrez leve (cores da seção 5.1) e ruído simples por seed para não parecer grade dura. Linha fina mais escura na fronteira entre biomas.
- Obstáculos: triângulos cinza-escuro (montanha `#5A5550`), manchas azul-petróleo (lago `#2C4A5A`), colunas quebradas (ruína `#6E655C`).
- Cidades: escudo heráldico SVG na cor escolhida pelo jogador (12 cores), com nome e nível embaixo. A forma muda por era (paliçada, muro, torre com chama). Cidade com escudo ganha um anel dourado.
- Acampamentos: estandarte em `--blood` com ícone da facção (caveira oca, gota de sal, coroa de gelo) e o número do nível.
- Nós: ícone do recurso sobre um círculo (`food` trigo, `wood` tronco, `stone` bloco, `gold` moeda) + pontinhos de nível.
- Marchas: linha tracejada da origem ao alvo, ponto que anda com o tempo; cor = amigo/você (`--ember`) ou outro jogador (`--text-muted`), ataque a você em `--blood` piscando.

**Ícones:** SVG do game-icons.net (licença CC BY 3.0, creditar na tela "Sobre") ou Lucide. Emojis (🌾 🪵 🪨 🪙 💀 🛡️ ⚔️) só no protótipo, porque mudam de aparência entre sistemas.

**Cidade (tela interna):** grade isométrica fake de 10 lotes com cards de prédio (ícone, nome, nível, barra de progresso). Sem arte de prédio no MVP: o card é a arte.

**Relatório de batalha:** cartão estilo pergaminho com as duas colunas, tabela de rodadas recolhida, e o resultado em letras grandes ("VITÓRIA" em `--gold`, "DERROTA" em `--blood`).

---

## 18. Fora do MVP

- Alianças, chat de aliança, ajuda em obra, território, rally (ataque em grupo).
- Pesquisa/tecnologia (academia).
- Eventos (KvK, temporadas, eventos semanais), conquistas, missões diárias.
- Batedor/espionagem, PvP em campo (atacar marcha coletando), ocupar nó de outro.
- Mover cidade, várias Fazendas/Serrarias por cidade.
- Estrelas, talentos e equipamento de herói; mais heróis; habilidades com escalonamento por nível.
- Mercado e troca de recursos entre jogadores.
- Chefes de mundo e acampamentos que guardam o dano recebido.
- Deserção por falta de comida, fome e moral.
- Tutorial guiado completo, notificações push, versão mobile.
- Monetização, anti-cheat avançado, vários mundos/servidores.
