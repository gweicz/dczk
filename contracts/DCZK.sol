/// DCZK.sol -- CZK Decentralized Stablecoin

pragma solidity ^0.5.16;

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

interface IVat {
    function hope(address) external;
}

interface IDaiJoin {
    function join(address, uint) external;
    function exit(address, uint) external;
}

interface IPot {
    function chi() external view returns (uint256);
    function rho() external view returns (uint256);
    function dsr() external view returns (uint256);
    function pie(address) external view returns (uint256);
    function drip() external returns (uint256);
    function join(uint256) external;
    function exit(uint256) external;
}

contract DCZK is IERC20 {

    // --- ERC20 Events ---
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    // --- Other events ---
    event TransferPrincipal(address indexed from, address indexed to, uint256 principal, uint256 value);
    event Mint(address indexed to, uint256 amount, uint256 principal);
    event Burn(address indexed burner, uint256 amount, uint256 principal);
    event Buy(address indexed buyer, uint256 dczk, uint256 dai);
    event Sell(address indexed seller, uint256 dczk, uint256 dai);
    event AddLiquidity(uint256 rate, uint256 amount);
    event RateUpdate(uint256 rate, address caller);

    // --- ERC20 basic vars ---
    string private _name = "dCZK Test v0.2";
    string private _symbol = "dCZK02";
    uint8 private _decimals = 18;
    mapping (address => uint256) private _balances;
    mapping (address => mapping (address => uint256)) private _allowances;
    uint256 private _totalSupply;

    // --- Data ---
    IERC20 public depositToken;
    IVat public vat;
    IDaiJoin public daiJoin;
    IPot public pot;
    uint256 public lrho;
    uint256 public lchi;
    uint256 public rate = 22000000000000000000;  // basic CZKDAI rate
    uint256 public maxRate;
    uint256 public totalVolume;
    uint public lastUpdate;

    // fixed oracleAdress - will be not included in mainnet release
    address public oracleAddress = 0x89188bE35B16AF852dC0A4a9e47e0cA871fadf9a;

    uint16 constant fee = 400;  // 0.25%

    struct Thread {
        uint next;
        uint amount;
    }
    mapping(uint => Thread) public txs;


    // --- Init ---
    constructor (address _dai, address _vat, address _daiJoin, address _pot) public {
        // set DAI address
        depositToken = IERC20(_dai);

        // DSR - DAI Savings Rate
        daiJoin = IDaiJoin(_daiJoin);
        vat = IVat(_vat);
        pot = IPot(_pot);
        // pot = new Pot(address(this));           // MakerDAO DSR `pot` (for testing purposes)
        vat.hope(address(daiJoin));
        vat.hope(address(pot));

        depositToken.approve(address(daiJoin), uint(-1));
    }

    // --- Math ---
    // Taken from official DSR contract:
    // https://github.com/makerdao/dss/blob/master/src/pot.sol

    uint constant RAY = 10 ** 27;
    function rpow(uint x, uint n, uint base) internal pure returns (uint z) {
        assembly {
            switch x case 0 {switch n case 0 {z := base} default {z := 0}}
            default {
                switch mod(n, 2) case 0 { z := base } default { z := x }
                let half := div(base, 2)  // for rounding.
                for { n := div(n, 2) } n { n := div(n,2) } { // solium-disable-line
                    let xx := mul(x, x)
                    if iszero(eq(div(xx, x), x)) { revert(0,0) }
                    let xxRound := add(xx, half)
                    if lt(xxRound, xx) { revert(0,0) }
                    x := div(xxRound, base)
                    if mod(n,2) {
                        let zx := mul(z, x)
                        if and(iszero(iszero(x)), iszero(eq(div(zx, x), z))) { revert(0,0) }
                        let zxRound := add(zx, half)
                        if lt(zxRound, zx) { revert(0,0) }
                        z := div(zxRound, base)
                    }
                }
            }
        }
    }

    function add(uint x, uint y) internal pure returns (uint z) {
        require((z = x + y) >= x);
    }

    function sub(uint x, uint y) internal pure returns (uint z) {
        return sub(x, y, "SafeMath: subtraction overflow");
    }

    function sub(uint x, uint y, string memory err) internal pure returns (uint z) {
        require((z = x - y) <= x, err);
    }

    function mul(uint x, uint y) internal pure returns (uint z) {
        require(y == 0 || (z = x * y) / y == x);
    }

    function rmul(uint x, uint y) internal pure returns (uint z) {
        // always rounds down
        z = mul(x, y) / RAY;
    }

    function rdiv(uint x, uint y) internal pure returns (uint z) {
        // always rounds down
        z = mul(x, RAY) / y;
    }

    function rdivup(uint x, uint y) internal pure returns (uint z) {
        // always rounds up
        z = add(mul(x, RAY), sub(y, 1)) / y;
    }

    // --- ERC20 Token ---

    function name() public view returns (string memory) {
        return _name;
    }

    function symbol() public view returns (string memory) {
        return _symbol;
    }

    function decimals() public view returns (uint8) {
        return _decimals;
    }

    function totalSupply() public view returns (uint256) {
        return rmul(_chi(), _totalSupply);
    }

    function balanceOf(address account) public view returns (uint) {
        return rmul(_chi(), _balances[account]);
    }

    function transfer(address recipient, uint256 amount) public returns (bool) {
        _transfer(msg.sender, recipient, amount);
        return true;
    }

    function allowance(address owner, address spender) public view returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount) public returns (bool) {
        _approve(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) public returns (bool) {
        _transfer(sender, recipient, amount);
        _approve(sender, msg.sender, sub(_allowances[sender][msg.sender], amount, "ERC20: transfer amount exceeds allowance"));
        return true;
    }

    function increaseAllowance(address spender, uint256 addedValue) public returns (bool) {
        _approve(msg.sender, spender, add(_allowances[msg.sender][spender], addedValue));
        return true;
    }

    function decreaseAllowance(address spender, uint256 subtractedValue) public returns (bool) {
        _approve(msg.sender, spender, sub(_allowances[msg.sender][spender], subtractedValue, "ERC20: decreased allowance below zero"));
        return true;
    }

    function _transfer(address sender, address recipient, uint256 amount) internal {
        require(sender != address(0), "ERC20: transfer from the zero address");
        require(recipient != address(0), "ERC20: transfer to the zero address");

        uint256 chi = (now > pot.rho()) ? pot.drip() : pot.chi();
        uint pie = rdiv(amount, chi);

        _balances[sender] = sub(_balances[sender], pie, "ERC20: transfer amount exceeds balance");
        _balances[recipient] = add(_balances[recipient], pie);

        emit Transfer(sender, recipient, amount);
        emit TransferPrincipal(sender, recipient, pie, amount);
    }

    function _approve(address owner, address spender, uint256 amount) internal {
        require(owner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    // --- Principal balances ---

    function principalBalanceOf(address account) public view returns (uint) {
        return _balances[account];
    }

    function principalTotalSupply() public view returns (uint256) {
        return _totalSupply;
    }

    // --- DSR (DAI Savings rate) integration ---

    function _chi() internal view returns (uint) {
        return rmul(rpow(pot.dsr(), now - pot.rho(), RAY), pot.chi());
    }

    function _drip() internal {
        require(now >= lrho, "dczk/invalid-now");
        uint tmp = _chi();
        uint chi_ = sub(tmp, lchi);
        lchi = tmp;
        lrho = now;
        uint amount = rmul(chi_, principalPotSupply());
        _addLiquidity(amount);
        emit AddLiquidity(rate, amount);
    }

    function potDrip() public view returns (uint) {
        return rmul(sub(_chi(), lchi), principalPotSupply());
    }

    function potSupply() public view returns (uint256) {
        return rmul(_chi(), pot.pie(address(this)));
    }

    function principalPotSupply() public view returns (uint256) {
        return pot.pie(address(this));
    }

    // --- Minting (internal) ---

    function _mint(address dst, uint256 czk, uint256 dai) private {
        require(dst != address(0), "ERC20: mint to the zero address");

        uint256 chi = (now > pot.rho()) ? pot.drip() : pot.chi();
        uint pie = rdiv(dai, chi);
        daiJoin.join(address(this), dai);
        pot.join(pie);
        uint spie = rdiv(czk, chi);

        _totalSupply = add(_totalSupply, spie);
        _balances[dst] = add(_balances[dst], spie);

        emit Transfer(address(0), dst, czk);
        emit TransferPrincipal(address(0), dst, spie, czk);
        emit Mint(dst, czk, spie);
    }

    // --- Burning (internal) ---

    function _burn(address src, uint256 czk, uint256 dai) private {
        require(src != address(0), "ERC20: burn from the zero address");
        require(balanceOf(src) >= czk, "dczk/insufficient-balance");

        uint chi = (now > pot.rho()) ? pot.drip() : pot.chi();
        uint spie = rdivup(czk, chi);

        _balances[src] = sub(_balances[src], spie, "ERC20: burn amount exceeds balance");
        _totalSupply = sub(_totalSupply, spie);

        uint pie = rdivup(dai, chi);
        if (pie != 0) {
            pot.exit(pie);
            daiJoin.exit(msg.sender, rmul(chi, pie));
        }

        _approve(src, msg.sender, sub(_allowances[src][address(this)], czk, "ERC20: burn amount exceeds allowance"));
        emit Transfer(src, address(0), czk);
        emit TransferPrincipal(src, address(0), spie, czk);
        emit Burn(src, czk, spie);
    }

    // --- DEX Decentralized exchange ---

    function _addLiquidity(uint256 amount) internal {
        if (txs[rate].amount == 0 && maxRate != 0) {
            uint currentRate = maxRate;
            uint prevRate = 0;
            while (currentRate >= rate){
                prevRate = currentRate;
                if (txs[currentRate].next != 0) {
                    currentRate = txs[currentRate].next;
                } else {
                    currentRate = 0;
                }
            }
            if (currentRate != rate) {
                if (prevRate == 0) {
                    txs[rate].next = maxRate;
                    maxRate = rate;
                } else {
                    txs[prevRate].next = rate;
                    txs[rate].next = currentRate;
                }
            }
        }
        if (maxRate < rate) {
            maxRate = rate;
        }
        txs[rate].amount += amount;
    }

    function buy(uint256 amount) public {
        require(rate != 0, "rate cannot be 0");
        require(depositToken.allowance(msg.sender, address(this)) >= amount, "dczk/insufficient-allowance");
        _drip();

        // transfer DAI to this contract
        depositToken.transferFrom(msg.sender, address(this), amount);

        // calculate fee - 0.25%
        uint _fee = amount / fee;
        uint rest = amount - _fee;
        // TODO - do something with the fee - now its freezed on contract forever

        // add liquidity to dex
        _addLiquidity(rest);

        // convert to stablecoin amount
        uint _converted = (rest * rate) / 10 ** 18;

        // save amount to total volume
        totalVolume += _converted;

        // mint tokens
        _mint(address(msg.sender), _converted, rest);

        emit Buy(msg.sender, _converted, rest);
    }

    function sell(uint256 amount) public {
        require(maxRate != 0, "max_rate cannot be 0");
        require(allowance(msg.sender, address(this)) >= amount, "czk/insufficient-allowance");
        _drip();

        // update total volume
        totalVolume += amount;

        // calculate rate & deposit
        uint _amount = amount;
        uint deposit = 0;
        uint currentRate = maxRate;
        while (_amount > 0) {
            uint full = (txs[currentRate].amount * currentRate) / 10 ** 18;
            if (full > _amount) {
                uint partialAmount = _amount * 10 ** 18 / currentRate;
                txs[currentRate].amount -= partialAmount;
                deposit += partialAmount;
                _amount = 0;
            } else {
                _amount -= full;
                deposit += txs[currentRate].amount;
                txs[currentRate].amount = 0;
                maxRate = txs[currentRate].next;
            }
            if (txs[currentRate].next != 0) {
                currentRate = txs[currentRate].next;
            }
        }
        // burn coins
        _burn(msg.sender, amount, deposit);

        emit Sell(msg.sender, amount, deposit);
    }

    function getThreads() public view returns(uint[] memory rates, uint[] memory amounts) {
        uint len = 0;
        if (maxRate != 0) {
            len += 1;
            uint currentRate = maxRate;
            while (txs[currentRate].next != 0) {
                len += 1;
                currentRate = txs[currentRate].next;
            }
            currentRate = maxRate;
            rates = new uint[](len);
            amounts = new uint[](len);
            amounts[0] = txs[currentRate].amount;
            rates[0] = currentRate;
            len = 0;
            while (txs[currentRate].next != 0 && len > 9) {
                len += 1;
                currentRate = txs[currentRate].next;
                rates[len] = currentRate;
                amounts[len] = txs[currentRate].amount;
            }
        }
    }

    // --- Oracle ---

    function updateRate(uint _rate) public {
        // TODO implement Chainlink or other oracle
        require(msg.sender == oracleAddress, "dczk/permission-denied");
        rate = _rate;
        lastUpdate = now;
        emit RateUpdate(rate, msg.sender);
    }
}
