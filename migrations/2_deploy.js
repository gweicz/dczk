const DCZK = artifacts.require("DCZK")
module.exports = async function(deployer) {
  await deployer.deploy(
    DCZK,
    '0x4F96Fe3b7A6Cf9725f59d353F723c1bDb64CA6Aa',     // DAI
    '0xbA987bDB501d131f766fEe8180Da5d81b34b69d9',     // DAI/vat
    '0x5AA71a3ae1C0bd6ac27A1f28e1415fFFB6F15B8c',     // DAI/daiJoin
    '0xEA190DBDC7adF265260ec4dA6e9675Fd4f5A78bb'      // DAi/pot
  )
}

