# Contribuindo com o Easy LUT

Obrigado por querer ajudar. Este guia explica como rodar o projeto no seu computador e como enviar mudanças.

## Relatando um problema

Abra uma [issue](../../issues/new/choose) e preencha o modelo. As informações que mais ajudam são a versão do Premiere, a versão do Windows, a forma de instalação (instalador ou manual) e a mensagem que aparece no rodapé do painel.

## Preparando o ambiente

O projeto não tem etapa de compilação: é HTML, CSS e JavaScript puros, mais um script ExtendScript. Para desenvolver:

1. Libere extensões sem assinatura (valor `PlayerDebugMode` = `1` em `HKEY_CURRENT_USER\Software\Adobe\CSXS.9` até `CSXS.13`). O passo a passo está no [README](README.md#passo-2--libere-extensões-sem-assinatura-no-registro).
2. Faça o Premiere ler a pasta do repositório diretamente, com um link simbólico, para não precisar copiar a cada mudança. Em um Prompt de Comando como administrador:

   ```bat
   mklink /D "%APPDATA%\Adobe\CEP\extensions\EasyLUT" "C:\caminho\do\repositorio\EasyLUT"
   ```

   Se já existir uma pasta `EasyLUT` ali, apague antes.
3. Reabra o Premiere e abra o painel em **Janela › Extensões › Easy LUT**.

### Depurando o painel

Crie um arquivo chamado `.debug` dentro da pasta `EasyLUT`, com este conteúdo:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ExtensionList>
  <Extension Id="com.easylut.premiere.panel">
    <HostList>
      <Host Name="PPRO" Port="8088"/>
    </HostList>
  </Extension>
</ExtensionList>
```

Reabra o Premiere, abra o painel e acesse `http://localhost:8088` no Chrome. Você terá as ferramentas de desenvolvedor para o painel. O arquivo `.debug` já está no `.gitignore`.

## Convenções de código

- **`js/main.js` e `css/style.css`:** JavaScript moderno e CSS puro, sem bibliotecas externas e sem etapa de build. Mantenha as cores nas variáveis do início do `style.css`.
- **`jsx/host.jsx`:** é ExtendScript, que é baseado em ES3. Não use `let`, `const`, funções de seta, `JSON` nem outros recursos modernos nesse arquivo.
- Mensagens para o usuário em português do Brasil.
- Se mudar o visual, atualize a [paleta no README](README.md#paleta-de-cores) quando as cores mudarem.

## Enviando mudanças

1. Faça um *fork* do repositório e crie uma branch (`git checkout -b minha-melhoria`).
2. Teste no Premiere: abrir o painel, carregar uma pasta de LUTs, capturar o frame, aplicar e remover uma LUT.
3. Descreva no *pull request* o que mudou e por quê. Se mudar algo visível, inclua uma captura de tela.
4. Adicione uma linha no [CHANGELOG](CHANGELOG.md), em uma seção "Não lançado" no topo.

O instalador e o script que o gera não fazem parte do repositório. As versões e os instaladores são publicados pelo mantenedor.
