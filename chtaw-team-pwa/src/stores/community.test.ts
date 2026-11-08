import {describe,it,expect,vi,beforeEach} from 'vitest';
import {useCommunity,mergeMessages} from './community';
import {messagesService} from '@/services/messages.service';
import type {Message,Group} from '@/types';
const group:Group={id:'private',name:'Private',description:'',isGeneral:false,color:'#aabbcc',memberIds:['user']};
const message=(id:string):Message=>({id,groupId:'private',authorId:'user',kind:'text',text:id,createdAt:`2026-11-03T10:00:${id.padStart(2,'0')}Z`});
beforeEach(()=>{useCommunity.getState().clear();useCommunity.setState({session:{userId:'user',mode:'real'},groups:[group]});vi.restoreAllMocks();});
describe('État réel de la messagerie',()=>{
 it('démarre sans seed ni données persistées de démonstration',()=>{expect(useCommunity.getState().users).toEqual([]);expect(useCommunity.getState().messages).toEqual([]);});
 it('déduplique les réponses HTTP et événements Socket.IO par identifiant',()=>{const state=useCommunity.getState();state.receiveMessage(message('1'));state.receiveMessage(message('1'));expect(useCommunity.getState().messages).toHaveLength(1);expect(mergeMessages([message('2')],[message('1')]).map(m=>m.id)).toEqual(['1','2']);});
 it('supprime immédiatement les données d’un groupe retiré',()=>{useCommunity.getState().receiveMessage(message('1'));useCommunity.getState().removeGroup('private');useCommunity.getState().receiveMessage(message('2'));expect(useCommunity.getState().groups).toEqual([]);expect(useCommunity.getState().messages).toEqual([]);});
 it('rattrape plusieurs pages manquées après une déconnexion',async()=>{useCommunity.setState({messages:[message('1')],history:{private:{loaded:true,loading:false,nextCursor:null}}});vi.spyOn(useCommunity.getState(),'sync').mockResolvedValue();const history=vi.spyOn(messagesService,'history').mockResolvedValueOnce({items:[message('4'),message('3')],nextCursor:'older'}).mockResolvedValueOnce({items:[message('2'),message('1')],nextCursor:null});await useCommunity.getState().catchUp();expect(history).toHaveBeenCalledTimes(2);expect(useCommunity.getState().messages.map(m=>m.id)).toEqual(['1','2','3','4']);});
 it('efface les données privées au logout local sans modifier les mocks',()=>{useCommunity.getState().receiveMessage(message('1'));useCommunity.getState().clear();expect(useCommunity.getState().session).toBeNull();expect(useCommunity.getState().messages).toEqual([]);});
});
