import './aa.init'
import { expect } from 'chai'
import {
  ERC20__factory,
  EntryPoint__factory,
  SimpleAccount,
  SimpleAccountFactory,
} from '../typechain'
import {
  fund,
  createAccount,
  createAccountOwner,
  AddressZero,
  createAddress,
} from './testutils'
import { BigNumber, Wallet } from 'ethers/lib/ethers'
import { ethers } from 'hardhat'
import {
  fillAndSign,
  getUserOpHash
} from './UserOp'
import config from './config'


describe('EntryPoint', function () {
  let simpleAccountFactory: SimpleAccountFactory

  let accountOwner: Wallet
  const ethersSigner = ethers.provider.getSigner()
  let account: SimpleAccount

  before(async function () {
    const chainId = await ethers.provider.getNetwork().then(net => net.chainId);
    const entryPoint = EntryPoint__factory.connect(config.entryPointAddress, ethers.provider.getSigner());

    accountOwner = createAccountOwner();
    ({
      proxy: account,
      accountFactory: simpleAccountFactory
    } = await createAccount(ethersSigner, await accountOwner.getAddress()))
    await fund(account)

    // sanity: validate helper functions
    const sampleOp = await fillAndSign({
      sender: account.address
    }, accountOwner, entryPoint)

    expect(getUserOpHash(sampleOp, entryPoint.address, chainId)).to.eql(await entryPoint.getUserOpHash(sampleOp))
  })

  describe('Stake Management', () => {
    describe("with deposit", () => {
      let address2: string;
      const signer2 = ethers.provider.getSigner(2)
      const vtho = ERC20__factory.connect(config.VTHOAddress, signer2)
      const entryPoint = EntryPoint__factory.connect(config.entryPointAddress, signer2)
      const DEPOSIT = 1000;

      beforeEach(async function () {
        // Approve transfer from signer to Entrypoint and deposit
        await vtho.approve(config.entryPointAddress, DEPOSIT);
        address2 = await signer2.getAddress();
      })

      afterEach(async function () {
        // Reset state by withdrawing deposit
        const balance = await entryPoint.balanceOf(address2);
        await entryPoint.withdrawTo(address2, balance);
      })

      it("should transfer full approved amount into EntryPoint", async () => {
        // Transfer approved amount to entrpoint
        await entryPoint.depositTo(address2);

        // Check amount has been deposited
        expect(await entryPoint.balanceOf(address2)).to.eql(DEPOSIT)
        expect(await entryPoint.getDepositInfo(await signer2.getAddress())).to.eql({
          deposit: DEPOSIT,
          staked: false,
          stake: 0,
          unstakeDelaySec: 0,
          withdrawTime: 0
        })

        // Check updated allowance
        expect(await vtho.allowance(address2, config.entryPointAddress)).to.eql(0);
      })

      it("should transfer partial approved amount into EntryPoint", async () => {
        // Transfer partial amount to entrpoint
        const ONE = 1;
        await entryPoint.depositAmountTo(address2, DEPOSIT - ONE);

        // Check amount has been deposited
        expect(await entryPoint.balanceOf(address2)).to.eql(DEPOSIT - ONE)
        expect(await entryPoint.getDepositInfo(await signer2.getAddress())).to.eql({
          deposit: DEPOSIT - ONE,
          staked: false,
          stake: 0,
          unstakeDelaySec: 0,
          withdrawTime: 0
        })

        // Check updated allowance
        expect(await vtho.allowance(address2, config.entryPointAddress)).to.eql(ONE);
      })

      it("should fail to transfer more than approved amount into EntryPoint", async () => {
        // Check transferring more than the amount fails
        expect(entryPoint.depositAmountTo(address2, DEPOSIT + 1)).to.revertedWith("amount to deposit > allowance")
      })

      it('should fail to withdraw larger amount than available', async () => {
        const addrTo = createAddress()
        await expect(entryPoint.withdrawTo(addrTo, DEPOSIT)).to.revertedWith("Withdraw amount too large");
      })

      it('should withdraw amount', async () => {
        const addrTo = createAddress()
        await entryPoint.depositTo(address2)
        const depositBefore = await entryPoint.balanceOf(address2)
        await entryPoint.withdrawTo(addrTo, 1)
        expect(await entryPoint.balanceOf(address2)).to.equal(depositBefore.sub(1))
        expect(await vtho.balanceOf(addrTo)).to.equal(1)
      })
    })

    describe('without stake', () => {
      const signer3 = ethers.provider.getSigner(3)
      const entryPoint = EntryPoint__factory.connect(config.entryPointAddress, signer3)
      const vtho = ERC20__factory.connect(config.VTHOAddress, signer3)
      it('should fail to stake without approved amount', async () => {
        await vtho.approve(config.entryPointAddress, 0);
        await expect(entryPoint.addStake(0)).to.revertedWith("amount to stake == 0")
      })
      it('should fail to stake more than approved amount', async () => {
        await vtho.approve(config.entryPointAddress, 100);
        await expect(entryPoint.addStakeAmount(0, 101)).to.revertedWith("amount to stake > allowance")
      })
      it('should fail to stake without delay', async () => {
        await vtho.approve(config.entryPointAddress, 100);
        await expect(entryPoint.addStake(0)).to.revertedWith('must specify unstake delay')
        await expect(entryPoint.addStakeAmount(0, 100)).to.revertedWith('must specify unstake delay')
      })
      it('should fail to unlock', async () => {
        await expect(entryPoint.unlockStake()).to.revertedWith('not staked')
      })
    });

    describe('with stake', () => {
      const UNSTAKE_DELAY_SEC = 60;
      var address4: string;
      const signer4 = ethers.provider.getSigner(4)
      const entryPoint = EntryPoint__factory.connect(config.entryPointAddress, signer4)
      const vtho = ERC20__factory.connect(config.VTHOAddress, signer4)
    
      before(async () => {
        address4 = await signer4.getAddress()
        await vtho.approve(config.entryPointAddress, 2000)
        await entryPoint.addStake(UNSTAKE_DELAY_SEC)
      })
      it('should report "staked" state', async () => {
        const { stake, staked, unstakeDelaySec, withdrawTime } = await entryPoint.getDepositInfo(address4)
        expect({ stake, staked, unstakeDelaySec, withdrawTime }).to.eql({
          stake: 2000,
          staked: true,
          unstakeDelaySec: UNSTAKE_DELAY_SEC,
          withdrawTime: 0
        })
      })

      it('should succeed to stake again', async () => {
        const { stake } = await entryPoint.getDepositInfo(address4)
        await vtho.approve(config.entryPointAddress, 1000);
        await entryPoint.addStake(UNSTAKE_DELAY_SEC)
        const { stake: stakeAfter } = await entryPoint.getDepositInfo(address4)
        expect(stakeAfter).to.eq(stake.add(1000))
      })
      it('should fail to withdraw before unlock', async () => {
        await expect(entryPoint.withdrawStake(AddressZero)).to.revertedWith('must call unlockStake() first')
      })
      describe('with unlocked stake', () => {
        var withdrawTime1: number
        before(async () => {
          let transaction = await entryPoint.unlockStake();
          withdrawTime1 = await ethers.provider.getBlock(transaction.blockHash!).then(block => block.timestamp) + UNSTAKE_DELAY_SEC
        })
        it('should report as "not staked"', async () => {
          expect(await entryPoint.getDepositInfo(address4).then(info => info.staked)).to.eq(false)
        })
        it('should report unstake state', async () => {
          const { stake, staked, unstakeDelaySec, withdrawTime } = await entryPoint.getDepositInfo(address4)
          expect({ stake, staked, unstakeDelaySec, withdrawTime }).to.eql({
            stake: 3000,
            staked: false,
            unstakeDelaySec: UNSTAKE_DELAY_SEC,
            withdrawTime: withdrawTime1
          })
        })
        it('should fail to withdraw before unlock timeout', async () => {
          await expect(entryPoint.withdrawStake(AddressZero)).to.revertedWith('Stake withdrawal is not due')
        })
        it('should fail to unlock again', async () => {
          await expect(entryPoint.unlockStake()).to.revertedWith('already unstaking')
        })
        describe('after unstake delay', () => {
          before(async () => {
            // wait 60 seconds
            await new Promise(r => setTimeout(r, 60000));
          })
          it('should fail to unlock again', async () => {
            await expect(entryPoint.unlockStake()).to.revertedWith('already unstaking')
          })
          it('adding stake should reset "unlockStake"', async () => {
            await vtho.approve(config.entryPointAddress, 1000);
            await entryPoint.addStake(UNSTAKE_DELAY_SEC)
            const { stake, staked, unstakeDelaySec, withdrawTime } = await entryPoint.getDepositInfo(address4)
            expect({ stake, staked, unstakeDelaySec, withdrawTime }).to.eql({
              stake: 4000,
              staked: true,
              unstakeDelaySec: UNSTAKE_DELAY_SEC,
              withdrawTime: 0
            })
          })
          it('should succeed to withdraw', async () => {
            await entryPoint.unlockStake();
            // wait 60 seconds
            await new Promise(r => setTimeout(r, 60000));
            const { stake } = await entryPoint.getDepositInfo(address4)
            const addr1 = createAddress()
            await entryPoint.withdrawStake(addr1)
            expect(await vtho.balanceOf(addr1)).to.eq(stake)
            const { stake: stakeAfter, withdrawTime, unstakeDelaySec } = await entryPoint.getDepositInfo(address4)

            expect({ stakeAfter, withdrawTime, unstakeDelaySec }).to.eql({
              stakeAfter: BigNumber.from(0),
              unstakeDelaySec: 0,
              withdrawTime: 0
            })
          })
        })
      })
    })
    describe('with deposit', () => {
      const signer5 = ethers.provider.getSigner(5)
      const vtho = ERC20__factory.connect(config.VTHOAddress, signer5)
      const entryPoint = EntryPoint__factory.connect(config.entryPointAddress, signer5)
      let account: SimpleAccount
      let address5: string;
      before(async () => {
        address5 = await signer5.getAddress();
        await account.addDeposit(ONE_ETH )
        expect(await getBalance(account.address)).to.equal(0)
        expect(await account.getDeposit()).to.eql(ONE_ETH)
      })
      
    })
  })
})
