<p align="center"><img src="https://raw.githubusercontent.com/gweicz/dczk-frontend/master/src/img/dczk.png" width="130" height="130" /></p>

# dCZK DEX - Decentralizovaná Koruna

## PROJEKT POZASTAVEN - následující informace jsou neaktuální


> **Upozornění: Projekt je zatím ve fázi vývoje a je dostupný pouze na Ethereum Testnetu (Kovan). Použití na vlastní riziko.**

**dCZk** je *decentralizovaný* [ERC-20](https://cointelegraph.com/explained/erc-20-tokens-explained) kompatibilní [stablecoin](https://en.wikipedia.org/wiki/Stablecoin), **navázaný na kurz CZK** a **krytý na 100% rezervou v [DAI](https://medium.com/mycrypto/what-is-dai-and-how-does-it-work-742d09ba25d6)** (decentralizovaný stablecoin navázaný na americký dolar). Součástí dCZK je **automatické pozitivní úročení** všech účtů (*spoření*) a vlastní **decentralizovaná směnárna** (DEX), která zaručuje že je vždy možné vyměnit DAI za dCZK a naopak. Platforma je [Ethereum](https://ethereum.org/) a jeho technologie EVM ([Ethereum Virtual Machine](https://medium.com/mycrypto/the-ethereum-virtual-machine-how-does-it-work-9abac2b7c9e)).

Jedná se o jednoúčelový a nezměnitelný [chytrý kontrakt](https://cs.wikipedia.org/wiki/Chytr%C3%BD_kontrakt) ([zdrojový kód kontraktu](https://github.com/gweicz/dCZK/blob/master/contracts/DCZK.sol)), který má v sobě natvrdo zakódované pravidla, které přesně určují jakým způsobem probíhá *ražení nových* a *pálení existujících* mincí. Je navrhován tak, aby systém byl naprosto decentralizovaný - tedy aby nikdo nemohl systém ovlivnit (*trust-less*) a zároveň aby na něm každý mohl stavět bez jakkýkoliv povolení (*permission-less*).

Neustálý dostatek likvidity zaručuje integrovaná směnárna (DEX), která je založená na principu tzv. *amortizační knihy*. Kdykoliv se vytvoří nové dCZK za DAI, tak se kurz a množstí zapíše do systému (kurz pro ražení nových mincí je vždy aktuální - dle Oracle) - to poté slouží jako objednávková kniha, pro ty co chtějí dCZK spálit a vrátit DAI (při *prodeji* dCZK se umořují *nákupy* podle *amortizační knihy* vždy od nevyššího kurzu pro DAI). Nikdy tedy nemůže nastat situace, kdy v systému nebude dostatek peněz na likvidaci existujících dCZK.

Uložené rezervní DAI jsou automaticky uzamknuté v DSR ([Dai Savings Rate](https://ethereumprice.org/guides/article/dai-savings-rate-explained/)) a tak generují pozitivní úrok (v současnosti na ETH Mainnetu je to 7.50%). Tento úrok je automaticky přerozdělován držitelům dCZK v reálném čase každou sekundu.

Pokud se o systému chcete dozvědět více, nebo máte-li nějaké připomínky či nápady, budeme rádi když se zastavíte na našem Discord serveru:
* https://discord.gg/V2paCCg

## Rozcestník

* [dCZK DEX Testnet](https://testnet-dczk.gwei.cz/)
* [Zdrojový kód smart-contractu (dCZK.sol)](https://github.com/gweicz/dCZK/blob/master/contracts/DCZK.sol)
* [Harmonogram](#Harmonogram)
* [Nejčastější otázky](#nej%C4%8Dast%C4%9Bj%C5%A1%C3%AD-ot%C3%A1zky)
* [Reference](#Reference)

## Publikované verze (testnet)
Datum          | Verze   | Síť       | Adresa kontraktu  | ABI
---            | ---     | ---       | ---               | ---
**2020-02-20** | **0.3** | **Kovan** | **[0x621949FE9028A687aB9a3C04F6c6d6ab36A2E5db](https://kovan.etherscan.io/address/0x621949FE9028A687aB9a3C04F6c6d6ab36A2E5db)** | **[ABI](https://raw.githubusercontent.com/gweicz/dCZK/master/dapp/src/abi/DCZK/0.3/DCZK.json)**
2020-02-12     | 0.2     | Kovan     | [0x27De52bed4BD1aAf4F8fAcDB494Bc6527D5B93b1](https://kovan.etherscan.io/address/0x27de52bed4bd1aaf4f8facdb494bc6527d5b93b1) | [ABI](https://raw.githubusercontent.com/gweicz/dCZK/master/dapp/src/abi/DCZK/0.2/DCZK.json)
2020-02-09     | 0.1     | Kovan     | [0x1807123556d328E1eff32C2c743B89E079CE1f65](https://kovan.etherscan.io/address/0x1807123556d328E1eff32C2c743B89E079CE1f65) | [ABI](https://raw.githubusercontent.com/gweicz/dCZK/master/dapp/src/abi/DCZK/0.1/DCZK.json)

Pozn. tučně je aktuální výchozí verze na [testnet-dczk.gwei.cz](https://testnet-dczk.gwei.cz/).

## Harmonogram
### Fáze I. - Vývoj (aktuální fáze)
> únor - březen 2020
* ~~Spuštění na testnetu~~
* ~~Základní dApp pro ovládání systému~~ - [testnet-dczk.gwei.cz](https://testnet-dczk.gwei.cz)
* Whitepaper
* Vyřešení Oracle problému

### Fáze II. - Příprava na Mainnet
> duben - květen 2020
* Audit smart-kontraktu - bezpečnostní testy
* Finální logo dCZK
* Webová prezentace projektu
  * Funkce snadné výměny jakkéhokoliv ERC-20 tokenu/ETH za dCZK (integrace Uniswap)

### Fáze III. - Mainnet
> červen 2020 - ?
* Spuštění projektu na ETH Mainnetu
* Nasazení tokenu na Uniswap protokol - dCZK/ETH burza

## Nejčastější otázky

### Kde si můžu vytvořit dCZK mince?
Na stránce projektu, adresa je [testnet-dczk.gwei.cz](https://testnet-dczk.gwei.cz/) nebo jednoduše jen [gwei.cz](http://gwei.cz/).

### Co potřebuji abych si mohl vytvořit vlastní dCZK?
Projekt je postavený na kryptoměně Ethereum, takže potřebujete vhodnou peněženku, která ETH podporuje a zárověn podporuje dApps (web3 protokol) - tedy například [Metamask](https://metamask.io/). Peněženka musí být přepnutá na "Kovan Test Network".

Dále potřebujete ještě nějaké testovací mince Kovan ETH a Kovan DAI - viz. další otázka "*Jak mohu získat testovací Kovan DAI / ETH?"*.

### Jak mohu získat testovací Kovan DAI / ETH?
Tady je komplikovanější způsob, který ale funguje vždy:
1. Zažádejte si o Kovan ETH - [Kovan Faucet](https://faucet.kovan.network/) (nutný GitHub účet) nebo [Gitter - kovan-testnet/faucet](https://testnet-dczk.gwei.cz/) (nutný GitHub/GitLab/Twitter účet).
2. Když už máte Kovan ETH, tak použijte standartní postup pro generování DAI, tedy - Kovan ETH uzamkněte v MakerDAO kontraktu a vygenerujte si Kovan DAI - [MakerDAO Kovan](https://mcd-cdp-portal-git-develop.mkr-js-prod.now.sh/borrow?network=kovan).

Jednodušší způsob, kde bude možné získat (K)ETH a (K)DAI jedním kliknutím, připravujeme.

### Proč je zkratka "dCZK" a ne "XCZK", "WCZK" nebo cokoliv jiného?

Protože to asi nejlépe vystihuje celý koncept:
* "D" jako Decentralizovaná 
* "D" jako DAI (rezerva systému je uložena v DAI)

Pokud máte nějaký lepší nápad, klidně se s tím svěřte v nové [Issue](https://github.com/gweicz/dCZK/issues/new).

## Reference
* https://github.com/warashibe/WJPY
* https://github.com/makerdao/dss/blob/master/src/pot.sol
* https://github.com/dapphub/chai/blob/master/src/chai.sol
* https://github.com/aave/aave-protocol/blob/master/contracts/tokenization/AToken.sol

## Autoři
[gwei.cz](https://gwei.cz)

## Licence

BSD 2-Clause License
