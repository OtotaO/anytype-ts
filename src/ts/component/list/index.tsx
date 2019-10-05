import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { SortableContainer, SortableElement } from 'react-sortable-hoc';
import { Icon, IconUser, Smile } from 'ts/component';
import { observer, inject } from 'mobx-react';
import { dispatcher, I, Util} from 'ts/lib';

interface Props {
	documentStore?: any;
	onAdd?(e: any): void;
	helperContainer?(): any;
};

@inject('documentStore')
@observer
class ListIndex extends React.Component<Props, {}> {
	
	constructor (props: any) {
		super(props);
		
		this.onSortEnd = this.onSortEnd.bind(this);
	};
	
	render () {
		const { documentStore, onAdd, helperContainer } = this.props;
		const { documents } = documentStore;
		const length = documents.length;
		
		const Item = SortableElement((item: any) => {
			return (
				<div className="item" >
					<Smile icon={item.icon} size={24} />
					<div className="name">{item.name}</div>
				</div>
			);
		});
		
		const ItemAdd = SortableElement((item: any) => {
			return (
				<div className="item add" onClick={onAdd}>
					<Icon />
				</div>
			);
		});
		
		const List = SortableContainer((item: any) => {
			return (
				<div>
					{item.list.map((item: any, i: number) => (
						<Item key={item.id} {...item} index={i} />
					))}
					<ItemAdd index={length + 1} disabled={true} />
				</div>
			);
		});
		
		return (
			<List axis="xy" list={documents} helperContainer={helperContainer} onSortEnd={this.onSortEnd} />
		);
	};
	
	onSortEnd (result: any) {
		const { oldIndex, newIndex } = result;
		const { documentStore } = this.props;
		
		documentStore.documentSort(oldIndex, newIndex);
	};
	
};

export default ListIndex;