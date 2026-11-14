# Guia de publicação

Este guia mostra como colocar o código no GitHub e como publicar o instalador do Easy LUT para as pessoas baixarem.

A regra do projeto é simples:

- o **repositório** guarda só o código da extensão e a documentação;
- o **instalador `.exe`** é gerado no seu computador (Inno Setup) e vai **somente** para a página de **Releases**;
- o script do instalador (`.iss`) e a pasta `Output` ficam **só na sua máquina**. O `.gitignore` do projeto já bloqueia `*.iss`, `*.exe`, `*.zip` e `Output/`, para você não enviar nada disso por engano.

---

## Parte 1 — Subir o código para o GitHub (uma vez só)

### 1.1 Crie o repositório

1. Entre no [GitHub](https://github.com) e clique em **New repository** (botão **+** no canto superior direito).
2. Preencha:
   - **Repository name:** `easy-lut-premiere` (ou outro nome que preferir)
   - **Description:** `Painel para Adobe Premiere Pro que pré-visualiza e aplica LUTs .cube direto no clipe.`
   - **Public**
3. **Não marque** *Add a README*, *.gitignore* nem *license*. O projeto já tem esses arquivos.
4. Clique em **Create repository**.

### 1.2 Envie os arquivos

Com o [Git](https://git-scm.com/downloads) instalado, abra o terminal na pasta do projeto (a pasta que contém `README.md` e `EasyLUT`) e rode:

```bash
git init
git add .
git status
```

Leia a lista do `git status`. Ela deve mostrar `EasyLUT/`, `docs/`, `README.md` e os outros arquivos do projeto. **Não** pode aparecer nenhum `.exe`, `.iss` ou `.zip`. Se aparecer, pare e confira o `.gitignore`.

Depois:

```bash
git commit -m "Publicação inicial do Easy LUT 1.7.1"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/easy-lut-premiere.git
git push -u origin main
```

Troque `SEU-USUARIO` pelo seu nome de usuário do GitHub. Se preferir uma interface gráfica, o **GitHub Desktop** faz o mesmo: *File › Add local repository*, depois *Commit* e *Publish repository*.

### 1.3 Deixe a página do repositório mais profissional

Na página do repositório, clique na engrenagem ao lado de **About** e preencha:

- **Description:** a mesma frase acima.
- **Topics:** `premiere-pro`, `adobe-premiere`, `lut`, `cube-lut`, `color-grading`, `lumetri`, `cep-extension`, `video-editing`.
- Marque **Releases** para aparecer na barra lateral.

---

## Parte 2 — Gerar o instalador (no seu computador)

1. Abra o script do instalador no **Inno Setup**.
2. Clique em **Build › Compile**.
3. O instalador sai na pasta `Output`, com o nome `EasyLUT-Setup-1.7.1.exe`.

### Teste antes de publicar

Rode o instalador em um computador limpo, ou em uma máquina virtual, se puder:

- [ ] O assistente abre em português e com o tema escuro.
- [ ] A pasta sugerida termina em `CEP\extensions\EasyLUT`.
- [ ] Depois de instalar, o painel aparece em **Janela › Extensões › Easy LUT**.
- [ ] Aplicar e remover uma LUT funciona.
- [ ] Desinstalar pelo Windows remove a pasta da extensão.

### Gere o arquivo da instalação manual

Quem não quiser rodar o instalador baixa um ZIP só com a extensão:

1. Dê um clique com o botão direito na pasta **`EasyLUT`** › **Enviar para** › **Pasta compactada**.
2. Renomeie o arquivo para `EasyLUT-1.7.1-manual.zip`.
3. Abra o ZIP e confira: a **primeira coisa** dentro dele deve ser a pasta `EasyLUT` (e não os arquivos soltos). É assim que o passo a passo do README espera.

### Gere o código de verificação (opcional, recomendado)

O SHA-256 permite que as pessoas confiram se o arquivo baixado é o original. No PowerShell:

```powershell
Get-FileHash .\Output\EasyLUT-Setup-1.7.1.exe -Algorithm SHA256
```

Copie o valor que aparecer para colocar nas notas da versão.

---

## Parte 3 — Publicar a versão (Release)

### 3.1 Crie a tag

A tag marca no histórico qual versão do código corresponde ao instalador:

```bash
git tag -a v1.7.1 -m "Easy LUT 1.7.1"
git push origin v1.7.1
```

### 3.2 Crie a Release pelo site

1. No repositório, clique em **Releases** (barra lateral direita) › **Draft a new release**.
2. Em **Choose a tag**, selecione `v1.7.1`.
3. Em **Release title**, escreva `Easy LUT 1.7.1`.
4. Em **Describe this release**, cole as [notas da versão](#modelo-de-notas-da-versão) abaixo.
5. Em **Attach binaries**, arraste os dois arquivos:
   - `EasyLUT-Setup-1.7.1.exe`
   - `EasyLUT-1.7.1-manual.zip`
6. Marque **Set as the latest release**.
7. Clique em **Publish release**.

O link `…/releases/latest` do README passa a apontar para essa versão, e o GitHub também gera automaticamente os arquivos *Source code (zip)* e *(tar.gz)*.

### 3.3 Ou crie a Release pelo terminal (GitHub CLI)

Com o [GitHub CLI](https://cli.github.com) instalado e logado (`gh auth login`):

```bash
gh release create v1.7.1 \
  Output/EasyLUT-Setup-1.7.1.exe \
  EasyLUT-1.7.1-manual.zip \
  --title "Easy LUT 1.7.1" \
  --notes-file notas.md
```

No PowerShell, troque cada `\` do fim de linha por um acento grave (`` ` ``) ou escreva o comando em uma linha só.

### Modelo de notas da versão

````markdown
## Easy LUT 1.7.1

Resumo, em uma ou duas frases, do que mudou ou do que é esta versão.

### Como instalar
- **Instalador:** baixe `EasyLUT-Setup-1.7.1.exe`, feche o Premiere e execute.
- **Manual:** baixe `EasyLUT-1.7.1-manual.zip` e siga o [passo a passo do README](../../#opção-2--instalação-manual-copiar-e-colar).

### Novidades
- ...

### Correções
- ...

### Verificação
SHA-256 de `EasyLUT-Setup-1.7.1.exe`:
`COLE-O-CODIGO-AQUI`

Requer Adobe Premiere Pro 2020 (14.0) ou mais novo, no Windows.
````

---

## Parte 4 — A cada nova versão

Siga esta lista, na ordem:

1. **Número da versão.** Atualize em todos estes lugares, sempre com o mesmo valor:
   - [ ] `EasyLUT/CSXS/manifest.xml`: `ExtensionBundleVersion` e o `Version` da extensão (são dois lugares no mesmo arquivo)
   - [ ] `EasyLUT/index.html`: o texto "Versão" no rodapé
   - [ ] `README.md`: o selo de versão e os nomes de arquivo `EasyLUT-Setup-X.Y.Z.exe` e `EasyLUT-X.Y.Z-manual.zip`
   - [ ] Script do instalador (na sua máquina): a versão do aplicativo
2. **CHANGELOG.** Adicione a nova versão no topo de `CHANGELOG.md`.
3. **Commit e push** das mudanças.
4. **Gere o instalador** e o ZIP manual com o número novo ([Parte 2](#parte-2--gerar-o-instalador-no-seu-computador)).
5. **Crie a tag** `vX.Y.Z` e a **Release** ([Parte 3](#parte-3--publicar-a-versão-release)).

> Mantenha o `AppId` do instalador **sempre o mesmo** entre versões. É ele que faz o Windows entender que o instalador novo atualiza o programa que já está instalado, em vez de instalar uma segunda cópia.

---

## Sobre o aviso do Windows (SmartScreen)

Instaladores sem assinatura digital costumam disparar a tela azul **"O Windows protegeu o computador"**, principalmente nos primeiros downloads, e alguns antivírus podem reclamar de arquivos novos. Isso não indica que o arquivo tem problema, mas assusta quem baixa. O que ajuda:

- Explicar o aviso no README, como já está feito, com o caminho **Mais informações › Executar assim mesmo**.
- Publicar o **SHA-256** nas notas da versão, para quem quiser conferir o arquivo.
- Oferecer a **instalação manual**, para quem não quiser rodar o instalador.
- Para eliminar o aviso de vez, o caminho é assinar o instalador com um certificado de assinatura de código, que é pago.

---

## Dica final: troque a captura de tela

A imagem `docs/assets/screenshot.png` mostra a interface do painel com LUTs de exemplo. Quando puder, substitua por uma captura real feita dentro do Premiere, com as suas LUTs. Basta salvar a nova imagem com o mesmo nome e o mesmo caminho, e fazer um commit.
