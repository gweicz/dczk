/// Oracle.sol -- dCZK Oracle

pragma solidity ^0.5.16;

contract Oracle {

    event Update(uint256 rate, address caller);

    address owner = 0x89188bE35B16AF852dC0A4a9e47e0cA871fadf9a;
    uint256 public value = 22000000000000000000;
    uint256 public lastUpdate;

    function update(uint256 _value) external {
        // TODO implement Chainlink or other oracle
        require(msg.sender == owner, "oracle/permission-denied");
        value = _value;
        lastUpdate = now;
        emit Update(value, msg.sender);
    }
}
